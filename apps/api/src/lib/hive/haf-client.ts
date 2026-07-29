import { DEFAULT_HAF_API_URL } from './constants.js';
import type { HafBlockSearchPage, HafOperationRow } from './types.js';

export interface HafClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class HafClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HafClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_HAF_API_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getHeadBlock(): Promise<number> {
    return this.getLatestSyncedBlock();
  }

  async getLatestSyncedBlock(): Promise<number> {
    const value = await this.getJson<unknown>('/last-synced-block');

    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new Error('HAF last-synced-block response did not include a block number.');
    }

    return value;
  }

  async getCommentOperations(author: string, permlink: string): Promise<HafOperationRow[]> {
    const response = await this.getJson<{
      total_operations: number;
      total_pages: number;
      operations_result: HafOperationRow[];
    }>(
      `/accounts/${encodeURIComponent(author)}/operations/comments/${encodeURIComponent(permlink)}`,
    );

    return response.operations_result;
  }

  async searchBlocks(params: {
    operationTypes?: number[];
    fromBlock?: number;
    toBlock?: number;
    page?: number;
    pageSize?: number;
  }): Promise<HafBlockSearchPage> {
    const response = await this.getJson<unknown>('/block-search', {
      'operation-types': params.operationTypes?.join(','),
      'from-block': params.fromBlock,
      'to-block': params.toBlock,
      page: params.page,
      'page-size': params.pageSize,
    });

    return parseBlockSearchPage(response);
  }

  private async getJson<T>(
    path: string,
    params?: Record<string, number | string | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await this.fetchImpl(url);

    if (!response.ok) {
      throw new Error(`HAF request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}

export function parseBlockSearchPage(response: unknown): HafBlockSearchPage {
  if (Array.isArray(response)) {
    return { operations: response as HafOperationRow[] };
  }

  if (!response || typeof response !== 'object') {
    throw new Error('HAF block-search response was not an object.');
  }

  const source = response as Record<string, unknown>;
  const operations =
    source.operations_result ?? source.operations ?? source.results ?? source.rows ?? source.data;

  if (!Array.isArray(operations)) {
    throw new Error('HAF block-search response did not include operation rows.');
  }

  const page = optionalInteger(source.page);
  const totalPages = optionalInteger(source.total_pages ?? source.totalPages);

  return {
    operations: operations as HafOperationRow[],
    ...(page === undefined ? {} : { page }),
    ...(totalPages === undefined ? {} : { totalPages }),
  };
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const numericValue = typeof value === 'string' ? Number(value) : value;

  return typeof numericValue === 'number' && Number.isInteger(numericValue)
    ? numericValue
    : undefined;
}
