import { ApiError, type ApiErrorBody } from '@/lib/api/errors';
import { env } from '@/lib/env';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type JsonBody = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

type RequestOptions<TBody = JsonBody> = {
  body?: TBody | undefined;
  headers?: HeadersInit;
  signal?: AbortSignal | null;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function getApiBaseUrl() {
  return env.apiBaseUrl;
}

function buildUrl(path: string) {
  return new URL(path, getApiBaseUrl()).toString();
}

function hasJsonBody(body: unknown): body is JsonBody {
  return body !== undefined;
}

function createTimeoutSignal(milliseconds: number) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(milliseconds);
  }

  const controller = new AbortController();
  globalThis.setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  const activeSignals = signals.filter((signal) => !signal.aborted);

  if (activeSignals.length !== signals.length) {
    const controller = new AbortController();
    const abortedSignal = signals.find((signal) => signal.aborted);
    controller.abort(abortedSignal?.reason);
    return controller.signal;
  }

  if (activeSignals.length === 1) {
    return activeSignals[0]!;
  }

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any(activeSignals);
  }

  const controller = new AbortController();

  for (const signal of activeSignals) {
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }

  return controller.signal;
}

async function parseJsonResponse<TResponse>(response: Response) {
  if (response.status === 204) {
    return undefined as TResponse;
  }

  const text = await response.text();

  if (!text) {
    return undefined as TResponse;
  }

  return JSON.parse(text) as TResponse;
}

async function parseErrorBody(response: Response): Promise<ApiErrorBody | null> {
  const contentType = response.headers.get('content-type');

  if (!contentType?.includes('application/json')) {
    return null;
  }

  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return null;
  }
}

async function request<TResponse, TBody = JsonBody>(
  method: HttpMethod,
  path: string,
  options: RequestOptions<TBody> = {},
) {
  const headers = new Headers(options.headers);

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  if (hasJsonBody(options.body) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const requestInit: RequestInit = {
    credentials: 'include',
    method,
    headers,
  };

  requestInit.signal = combineSignals([
    createTimeoutSignal(DEFAULT_REQUEST_TIMEOUT_MS),
    ...(options.signal ? [options.signal] : []),
  ]);

  if (hasJsonBody(options.body)) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildUrl(path), requestInit);

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      statusText: response.statusText,
      body: await parseErrorBody(response),
    });
  }

  return parseJsonResponse<TResponse>(response);
}

export const apiClient = {
  get: <TResponse>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<TResponse>('GET', path, options),
  post: <TResponse, TBody = JsonBody>(
    path: string,
    body?: TBody,
    options?: Omit<RequestOptions<TBody>, 'body'>,
  ) => {
    const requestOptions: RequestOptions<TBody> = { ...options };

    if (body !== undefined) {
      requestOptions.body = body;
    }

    return request<TResponse, TBody>('POST', path, requestOptions);
  },
  put: <TResponse, TBody = JsonBody>(
    path: string,
    body?: TBody,
    options?: Omit<RequestOptions<TBody>, 'body'>,
  ) => {
    const requestOptions: RequestOptions<TBody> = { ...options };

    if (body !== undefined) {
      requestOptions.body = body;
    }

    return request<TResponse, TBody>('PUT', path, requestOptions);
  },
  patch: <TResponse, TBody = JsonBody>(
    path: string,
    body?: TBody,
    options?: Omit<RequestOptions<TBody>, 'body'>,
  ) => {
    const requestOptions: RequestOptions<TBody> = { ...options };

    if (body !== undefined) {
      requestOptions.body = body;
    }

    return request<TResponse, TBody>('PATCH', path, requestOptions);
  },
  delete: <TResponse, TBody = JsonBody>(
    path: string,
    body?: TBody,
    options?: Omit<RequestOptions<TBody>, 'body'>,
  ) => {
    const requestOptions: RequestOptions<TBody> = { ...options };

    if (body !== undefined) {
      requestOptions.body = body;
    }

    return request<TResponse, TBody>('DELETE', path, requestOptions);
  },
};

export type { RequestOptions };
