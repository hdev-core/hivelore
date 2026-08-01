import { ApiError, type ApiErrorBody } from '@/lib/api/errors';
import { env } from '@/lib/env';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type JsonBody = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

type RequestOptions<TBody = JsonBody> = {
  body?: TBody | undefined;
  headers?: HeadersInit;
  signal?: AbortSignal | null;
};

function getApiBaseUrl() {
  return env.apiBaseUrl;
}

function buildUrl(path: string) {
  return new URL(path, getApiBaseUrl()).toString();
}

function hasJsonBody(body: unknown): body is JsonBody {
  return body !== undefined;
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

  if (options.signal) {
    requestInit.signal = options.signal;
  }

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
