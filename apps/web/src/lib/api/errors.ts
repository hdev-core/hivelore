export type ApiErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  details?: unknown;
};

export class ApiError extends Error {
  readonly name = 'ApiError';
  readonly status: number;
  readonly statusText: string;
  readonly body: ApiErrorBody | null;
  readonly safeMessage = 'Something went wrong while contacting the API.';

  constructor({
    status,
    statusText,
    body,
  }: {
    status: number;
    statusText: string;
    body: ApiErrorBody | null;
  }) {
    super(`API request failed with status ${status}`);
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}
