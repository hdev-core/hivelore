import type { FastifyBaseLogger } from 'fastify';

type ErrorTrackingEvent = {
  error: unknown;
  method?: string | undefined;
  requestId?: string | undefined;
  url?: string | undefined;
};

type ErrorTrackerOptions = {
  enabled?: boolean;
  logger?: FastifyBaseLogger;
  timeoutMs?: number;
  webhookUrl?: string | undefined;
};

// Telemetry must never outlive the request it describes. Without a bound, a
// webhook that accepts the connection and never replies keeps this promise
// pending until OS-level TCP timeouts - minutes - and Fastify's onError hook
// would wait on it.
const DEFAULT_WEBHOOK_TIMEOUT_MS = 2_000;

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
    name: 'UnknownError',
  };
}

export async function reportUnhandledError(
  event: ErrorTrackingEvent,
  options: ErrorTrackerOptions = {},
) {
  const payload = {
    error: serializeError(event.error),
    method: event.method,
    requestId: event.requestId,
    service: 'hivelore-api',
    timestamp: new Date().toISOString(),
    url: event.url,
  };

  options.logger?.error(payload, 'Unhandled API error');

  if (!options.enabled || !options.webhookUrl) {
    return;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_WEBHOOK_TIMEOUT_MS;

  try {
    await fetch(options.webhookUrl, {
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    options.logger?.warn(
      {
        error: serializeError(error),
        requestId: event.requestId,
      },
      'Error tracking webhook delivery failed',
    );
  }
}
