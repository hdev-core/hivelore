import { DEFAULT_HAF_API_URL } from './constants.js';
import type { HafOperationRow } from './types.js';

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
    const headBlock = await this.getJson<{ head_block_num?: number; block_num?: number }>(
      '/headblock',
    );
    const value = headBlock.head_block_num ?? headBlock.block_num;

    if (value === undefined || !Number.isInteger(value)) {
      throw new Error('HAF headblock response did not include a block number.');
    }

    return Number(value);
  }

  async getCommentOperations(author: string, permlink: string): Promise<HafOperationRow[]> {
    return this.getJson<HafOperationRow[]>(
      `/accounts/${encodeURIComponent(author)}/operations/comments/${encodeURIComponent(permlink)}`,
    );
  }

  async searchBlocks(params: {
    operationTypes?: number[];
    fromBlock?: number;
    toBlock?: number;
    page?: number;
    pageSize?: number;
  }): Promise<unknown> {
    return this.getJson('/block-search', {
      'operation-types': params.operationTypes?.join(','),
      'from-block': params.fromBlock,
      'to-block': params.toBlock,
      page: params.page,
      'page-size': params.pageSize,
    });
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
