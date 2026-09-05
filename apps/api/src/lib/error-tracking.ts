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
  webhookUrl?: string | undefined;
};

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

  try {
    await fetch(options.webhookUrl, {
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
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
