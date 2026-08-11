import type { ApiTransaction } from '@hiveio/wax';

import { hashCanonicalJson } from '../canon-voting-policy.js';
import { verifyHiveLoreOperation } from './verification.js';
import { normalizeHafOperation } from './projection.js';
import { HafClient } from './haf-client.js';
import { HiveWaxClient } from './wax-client.js';
import { HIVE_CUSTOM_JSON_OPERATION_TYPE } from './constants.js';
import {
  DEFAULT_HIVE_RETRY_CONFIG,
  type HiveNetworkConfig,
  type HiveRetryConfig,
  sanitizeHiveNodeUrl,
} from './network-config.js';
import type { HafOperationRow, HiveLoreOperation, NormalizedHiveOperation } from './types.js';

// Server-side signed broadcasts are groundwork for future custodial/worker flows.
// The application currently uses this module primarily for confirming client-signed Hive broadcasts.

export type BroadcastStatusCode =
  | 'BROADCAST_CONFIRMED'
  | 'BROADCAST_REJECTED'
  | 'BROADCAST_CONFIRMATION_TIMEOUT'
  | 'BROADCAST_STATUS_UNKNOWN'
  | 'NETWORK_CONFIGURATION_ERROR'
  | 'NETWORK_MISMATCH'
  | 'TRANSACTION_EXPIRED'
  | 'PERMANENT_TRANSACTION_ERROR'
  | 'TRANSIENT_RPC_ERROR';

export type BroadcastFailureClass = 'transient' | 'permanent' | 'unknown';

export interface ConfirmedBroadcastResult {
  network: HiveNetworkConfig['name'];
  transactionId: string;
  blockNumber: number;
  transactionIndex?: number | undefined;
  operationIndexes?: number[] | undefined;
  blockchainTimestamp: string;
  confirmedAt: string;
  confirmationSource: 'rpc' | 'haf' | 'indexer';
  nodeUrl?: string | undefined;
  attempts: number;
}

export class HiveBroadcastError extends Error {
  constructor(
    public readonly code: BroadcastStatusCode,
    message: string,
    public readonly failureClass: BroadcastFailureClass,
    public readonly diagnostics: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface HiveBroadcastTransport {
  broadcast(nodeUrl: string, transaction: ApiTransaction, signal?: AbortSignal): Promise<void>;
  getTransaction?(params: {
    transactionId: string;
    nodeUrl?: string;
    signal?: AbortSignal;
  }): Promise<HafOperationRow[] | null>;
  searchBlocks(params: {
    fromBlock?: number;
    toBlock?: number;
    page?: number;
    pageSize?: number;
    operationTypes?: number[];
    nodeUrl?: string;
    signal?: AbortSignal;
  }): Promise<HafOperationRow[] | { operations: HafOperationRow[]; totalPages?: number }>;
  getHeadBlock(nodeUrl?: string, signal?: AbortSignal): Promise<number>;
}

export interface ConfirmOperationInput {
  transactionId: string;
  operationIndex?: number | undefined;
  expectedSigner?: string | undefined;
  expectedOperation?: HiveLoreOperation | undefined;
  blockNumberHint?: number | undefined;
  signal?: AbortSignal | undefined;
}

export class DefaultHiveBroadcastTransport implements HiveBroadcastTransport {
  constructor(private readonly network: HiveNetworkConfig) {}

  async broadcast(nodeUrl: string, transaction: ApiTransaction): Promise<void> {
    const client = new HiveWaxClient({
      apiEndpoint: nodeUrl,
      apiTimeoutMs: DEFAULT_HIVE_RETRY_CONFIG.requestTimeoutMs,
      chainId: this.network.chainId,
    });

    await client.broadcastTransaction(transaction);
  }

  async searchBlocks(params: {
    fromBlock?: number;
    toBlock?: number;
    page?: number;
    pageSize?: number;
    operationTypes?: number[];
    signal?: AbortSignal;
  }) {
    const client = new HafClient(
      this.network.hafUrl
        ? {
            baseUrl: this.network.hafUrl,
            requestTimeoutMs: DEFAULT_HIVE_RETRY_CONFIG.requestTimeoutMs,
          }
        : { requestTimeoutMs: DEFAULT_HIVE_RETRY_CONFIG.requestTimeoutMs },
    );
    return client.searchBlocks({
      ...(params.fromBlock === undefined ? {} : { fromBlock: params.fromBlock }),
      ...(params.operationTypes === undefined ? {} : { operationTypes: params.operationTypes }),
      ...(params.page === undefined ? {} : { page: params.page }),
      ...(params.pageSize === undefined ? {} : { pageSize: params.pageSize }),
      ...(params.toBlock === undefined ? {} : { toBlock: params.toBlock }),
      ...(params.signal ? { signal: params.signal } : {}),
    });
  }

  async getHeadBlock(_nodeUrl?: string, signal?: AbortSignal): Promise<number> {
    const client = new HafClient(
      this.network.hafUrl
        ? {
            baseUrl: this.network.hafUrl,
            requestTimeoutMs: DEFAULT_HIVE_RETRY_CONFIG.requestTimeoutMs,
          }
        : { requestTimeoutMs: DEFAULT_HIVE_RETRY_CONFIG.requestTimeoutMs },
    );

    return client.getHeadBlock(signal);
  }

  async getTransaction(params: {
    transactionId: string;
    nodeUrl?: string;
    signal?: AbortSignal;
  }): Promise<HafOperationRow[] | null> {
    const nodeUrl = params.nodeUrl ?? this.network.rpcNodes[0];

    if (!nodeUrl) {
      throw new HiveBroadcastError(
        'NETWORK_CONFIGURATION_ERROR',
        'No Hive RPC nodes are configured for transaction lookup.',
        'permanent',
      );
    }

    const response = await fetch(nodeUrl, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'condenser_api.get_transaction',
        params: [params.transactionId],
      }),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'POST',
      signal: createTimeoutSignal(DEFAULT_HIVE_RETRY_CONFIG.requestTimeoutMs, params.signal),
    });

    if (!response.ok) {
      throw Object.assign(
        new Error(`Hive transaction lookup failed: ${response.status} ${response.statusText}`),
        { status: response.status },
      );
    }

    const body = (await response.json()) as {
      error?: { message?: string };
      result?: unknown;
    };

    if (body.error) {
      const message = body.error.message ?? 'Hive transaction lookup failed.';

      if (message.toLowerCase().includes('unknown transaction')) {
        return null;
      }

      throw new Error(message);
    }

    return transactionLookupToRows(body.result, params.transactionId);
  }
}

export class HiveNodePool {
  private readonly states: Array<{
    url: string;
    consecutiveFailures: number;
    unhealthyUntil: number;
  }>;
  private cursor = 0;

  constructor(
    nodes: string[],
    private readonly retry: HiveRetryConfig,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.states = nodes.map((url) => ({ consecutiveFailures: 0, unhealthyUntil: 0, url }));
  }

  current(): string {
    const now = this.now();

    for (let offset = 0; offset < this.states.length; offset += 1) {
      const index = (this.cursor + offset) % this.states.length;
      const state = this.states[index];

      if (state && state.unhealthyUntil <= now) {
        this.cursor = index;

        return state.url;
      }
    }

    const fallback = this.states[this.cursor % this.states.length];

    if (!fallback) {
      throw new HiveBroadcastError(
        'NETWORK_CONFIGURATION_ERROR',
        'No Hive RPC nodes are configured.',
        'permanent',
      );
    }

    return fallback.url;
  }

  reportSuccess(nodeUrl: string) {
    const state = this.find(nodeUrl);

    if (state) {
      state.consecutiveFailures = 0;
      state.unhealthyUntil = 0;
    }
  }

  reportTransientFailure(nodeUrl: string) {
    const state = this.find(nodeUrl);

    if (!state) {
      return;
    }

    state.consecutiveFailures += 1;

    if (state.consecutiveFailures >= this.retry.maxConsecutiveNodeFailures) {
      state.unhealthyUntil = this.now() + this.retry.nodeCooldownMs;
      this.cursor = (this.states.indexOf(state) + 1) % this.states.length;
    }
  }

  private find(nodeUrl: string) {
    return this.states.find((state) => state.url === nodeUrl);
  }
}

export class HiveReliableBroadcaster {
  private readonly retry: HiveRetryConfig;
  private readonly pool: HiveNodePool;
  private readonly confirmationPool: HiveNodePool;

  constructor(
    private readonly network: HiveNetworkConfig,
    private readonly transport: HiveBroadcastTransport = new DefaultHiveBroadcastTransport(network),
    retry: Partial<HiveRetryConfig> = {},
    private readonly clock: {
      now(): number;
      sleep(ms: number, signal?: AbortSignal): Promise<void>;
      random(): number;
    } = systemClock,
  ) {
    this.retry = { ...DEFAULT_HIVE_RETRY_CONFIG, ...retry };
    this.pool = new HiveNodePool(network.rpcNodes, this.retry, () => this.clock.now());
    this.confirmationPool = new HiveNodePool(network.rpcNodes, this.retry, () => this.clock.now());
  }

  async broadcastSignedTransaction(input: {
    transaction: ApiTransaction;
    transactionId: string;
    expectedSigner?: string | undefined;
    expectedOperation?: HiveLoreOperation | undefined;
    signal?: AbortSignal | undefined;
  }): Promise<ConfirmedBroadcastResult> {
    const startedAt = this.clock.now();
    let attempts = 0;
    let lastError: HiveBroadcastError | null = null;

    while (attempts < this.retry.maxAttempts) {
      throwIfAborted(input.signal);

      if (this.clock.now() - startedAt > this.retry.totalDeadlineMs) {
        break;
      }

      attempts += 1;
      const nodeUrl = this.pool.current();
      const remainingDeadlineMs = this.retry.totalDeadlineMs - (this.clock.now() - startedAt);

      try {
        await this.transport.broadcast(nodeUrl, input.transaction, input.signal);
        this.pool.reportSuccess(nodeUrl);

        return await this.confirmAfterBroadcast({
          attempts,
          expectedOperation: input.expectedOperation,
          expectedSigner: input.expectedSigner,
          confirmationTimeoutMs: Math.min(this.retry.confirmationTimeoutMs, remainingDeadlineMs),
          nodeUrl,
          signal: input.signal,
          transactionId: input.transactionId,
        });
      } catch (error) {
        const classified = classifyHiveBroadcastError(error);
        lastError = classified;

        if (classified.failureClass === 'permanent') {
          throw classified;
        }

        this.pool.reportTransientFailure(nodeUrl);

        const ambiguous = isAmbiguousBroadcastError(classified);
        const confirmation = ambiguous
          ? await this.tryConfirm({
              attempts,
              confirmationTimeoutMs: Math.min(
                this.retry.confirmationTimeoutMs,
                Math.max(0, this.retry.totalDeadlineMs - (this.clock.now() - startedAt)),
              ),
              expectedOperation: input.expectedOperation,
              expectedSigner: input.expectedSigner,
              nodeUrl,
              signal: input.signal,
              transactionId: input.transactionId,
            })
          : null;

        if (confirmation) {
          return confirmation;
        }

        if (attempts >= this.retry.maxAttempts) {
          break;
        }

        await this.clock.sleep(
          delayForAttempt(attempts, this.retry, this.clock.random()),
          input.signal,
        );
      }
    }

    throw new HiveBroadcastError(
      lastError?.code === 'TRANSIENT_RPC_ERROR'
        ? 'BROADCAST_STATUS_UNKNOWN'
        : 'BROADCAST_CONFIRMATION_TIMEOUT',
      'Hive transaction broadcast status is unknown after bounded retries.',
      'unknown',
      {
        attempts,
        network: this.network.name,
        transactionId: input.transactionId,
      },
    );
  }

  async confirmTransaction(input: ConfirmOperationInput): Promise<ConfirmedBroadcastResult> {
    const operation = await this.confirmTransactionOperation(input);

    return toConfirmedBroadcastResult({
      attempts: 0,
      network: this.network,
      operation,
    });
  }

  async confirmTransactionOperation(
    input: ConfirmOperationInput,
  ): Promise<NormalizedHiveOperation> {
    const operation = await pollForConfirmedOperation({
      confirmationTimeoutMs: this.retry.confirmationTimeoutMs,
      clock: this.clock,
      nodePool: this.confirmationPool,
      input,
      network: this.network,
      pollIntervalMs: this.retry.confirmationPollIntervalMs,
      transport: this.transport,
    });

    if (!operation) {
      throw new HiveBroadcastError(
        'BROADCAST_CONFIRMATION_TIMEOUT',
        'Hive transaction was not found before the confirmation timeout.',
        'unknown',
        {
          network: this.network.name,
          transactionId: input.transactionId,
        },
      );
    }

    return operation;
  }

  private async confirmAfterBroadcast(input: {
    attempts: number;
    transactionId: string;
    expectedSigner?: string | undefined;
    expectedOperation?: HiveLoreOperation | undefined;
    confirmationTimeoutMs?: number | undefined;
    nodeUrl: string;
    signal?: AbortSignal | undefined;
  }): Promise<ConfirmedBroadcastResult> {
    const confirmed = await this.tryConfirm(input);

    if (confirmed) {
      return confirmed;
    }

    throw new HiveBroadcastError(
      'BROADCAST_STATUS_UNKNOWN',
      'Hive transaction broadcast was accepted but confirmation is still pending.',
      'unknown',
      {
        attempts: input.attempts,
        network: this.network.name,
        transactionId: input.transactionId,
      },
    );
  }

  private async tryConfirm(input: {
    attempts: number;
    transactionId: string;
    expectedSigner?: string | undefined;
    expectedOperation?: HiveLoreOperation | undefined;
    confirmationTimeoutMs?: number | undefined;
    nodeUrl: string;
    signal?: AbortSignal | undefined;
  }): Promise<ConfirmedBroadcastResult | null> {
    const operation = await pollForConfirmedOperation({
      confirmationTimeoutMs: input.confirmationTimeoutMs ?? this.retry.confirmationTimeoutMs,
      clock: this.clock,
      nodePool: this.confirmationPool,
      input,
      network: this.network,
      pollIntervalMs: this.retry.confirmationPollIntervalMs,
      transport: this.transport,
    });

    return operation
      ? toConfirmedBroadcastResult({
          attempts: input.attempts,
          network: this.network,
          nodeUrl: sanitizeHiveNodeUrl(input.nodeUrl),
          operation,
        })
      : null;
  }
}

export function classifyHiveBroadcastError(error: unknown): HiveBroadcastError {
  if (error instanceof HiveBroadcastError) {
    return error;
  }

  const detail = error instanceof Error ? error.message : String(error);
  const lower = detail.toLowerCase();
  const status =
    typeof error === 'object' && error ? Number((error as { status?: unknown }).status) : 0;

  if (lower.includes('expired')) {
    return new HiveBroadcastError('TRANSACTION_EXPIRED', 'Hive transaction expired.', 'permanent');
  }

  if (
    lower.includes('missing required signature') ||
    lower.includes('invalid signature') ||
    lower.includes('tx_missing_posting_auth') ||
    lower.includes('insufficient authority') ||
    lower.includes('malformed') ||
    lower.includes('parse') ||
    lower.includes('insufficient rc') ||
    lower.includes('resource credits')
  ) {
    return new HiveBroadcastError(
      'PERMANENT_TRANSACTION_ERROR',
      'Hive transaction was permanently rejected.',
      'permanent',
    );
  }

  if (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('network') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('bad gateway') ||
    lower.includes('already known') ||
    lower.includes('duplicate transaction')
  ) {
    return new HiveBroadcastError(
      'TRANSIENT_RPC_ERROR',
      'Hive RPC request failed transiently.',
      'transient',
      { status: status || undefined },
    );
  }

  return new HiveBroadcastError(
    'BROADCAST_STATUS_UNKNOWN',
    'Hive broadcast failed with an unclassified error.',
    'unknown',
  );
}

export function delayForAttempt(attempt: number, retry: HiveRetryConfig, random: number): number {
  const base = Math.min(
    retry.maxDelayMs,
    retry.initialDelayMs * retry.backoffMultiplier ** Math.max(0, attempt - 1),
  );
  const jitter = base * retry.jitterRatio * (random * 2 - 1);

  return Math.max(1, Math.round(base + jitter));
}

export async function pollForConfirmedOperation(input: {
  input: ConfirmOperationInput;
  transport: HiveBroadcastTransport;
  network: HiveNetworkConfig;
  nodePool?: HiveNodePool | undefined;
  confirmationTimeoutMs: number;
  pollIntervalMs: number;
  clock: {
    now(): number;
    sleep(ms: number, signal?: AbortSignal): Promise<void>;
  };
}): Promise<NormalizedHiveOperation | null> {
  const startedAt = input.clock.now();
  let fromBlock = input.input.blockNumberHint;
  const pageSize = 100;

  while (input.clock.now() - startedAt <= input.confirmationTimeoutMs) {
    throwIfAborted(input.input.signal);

    const nodeUrl = input.nodePool?.current();

    try {
      if (input.transport.getTransaction) {
        const transactionRows = await input.transport.getTransaction({
          ...(nodeUrl ? { nodeUrl } : {}),
          ...(input.input.signal ? { signal: input.input.signal } : {}),
          transactionId: input.input.transactionId,
        });

        if (transactionRows) {
          const confirmed = findAndVerifyOperation(transactionRows, input.input);

          if (confirmed) {
            if (nodeUrl) {
              input.nodePool?.reportSuccess(nodeUrl);
            }

            return confirmed;
          }
        }

        if (nodeUrl) {
          input.nodePool?.reportSuccess(nodeUrl);
        }

        await input.clock.sleep(input.pollIntervalMs, input.input.signal);
        continue;
      }

      const head = fromBlock
        ? fromBlock
        : await input.transport.getHeadBlock(nodeUrl, input.input.signal);
      const searchFromBlock = fromBlock ?? Math.max(1, head - 1_200);
      const searchToBlock = fromBlock ?? head;
      let page = 1;

      while (input.clock.now() - startedAt <= input.confirmationTimeoutMs) {
        throwIfAborted(input.input.signal);

        const searchPage = normalizeSearchPage(
          await input.transport.searchBlocks({
            fromBlock: searchFromBlock,
            ...(nodeUrl ? { nodeUrl } : {}),
            operationTypes: [HIVE_CUSTOM_JSON_OPERATION_TYPE],
            page,
            pageSize,
            toBlock: searchToBlock,
            ...(input.input.signal ? { signal: input.input.signal } : {}),
          }),
        );
        const confirmed = findAndVerifyOperation(searchPage.operations, input.input);

        if (confirmed) {
          if (nodeUrl) {
            input.nodePool?.reportSuccess(nodeUrl);
          }

          return confirmed;
        }

        if (
          searchPage.totalPages !== undefined
            ? page >= searchPage.totalPages
            : searchPage.operations.length < pageSize
        ) {
          break;
        }

        page += 1;
      }

      if (nodeUrl) {
        input.nodePool?.reportSuccess(nodeUrl);
      }
    } catch (error) {
      const classified = classifyHiveBroadcastError(error);

      if (classified.failureClass === 'permanent') {
        throw classified;
      }

      if (nodeUrl) {
        input.nodePool?.reportTransientFailure(nodeUrl);
      }
    }

    fromBlock = undefined;
    await input.clock.sleep(input.pollIntervalMs, input.input.signal);
  }

  return null;
}

export function findAndVerifyOperation(
  rows: HafOperationRow[],
  input: ConfirmOperationInput,
): NormalizedHiveOperation | null {
  for (const row of rows) {
    if (!rowMatchesTransaction(row, input.transactionId)) {
      continue;
    }

    if (!rowMatchesOperationIndex(row, input.operationIndex)) {
      continue;
    }

    let operation: NormalizedHiveOperation;

    try {
      operation = normalizeHafOperation(row);
    } catch (error) {
      throw new HiveBroadcastError(
        'BROADCAST_REJECTED',
        'Confirmed Hive row for the transaction could not be normalized.',
        'permanent',
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }

    const verification = verifyHiveLoreOperation({
      ...(input.expectedSigner ? { expectedSigner: input.expectedSigner } : {}),
      operation: operation.operation,
    });

    if (!verification.ok) {
      throw new HiveBroadcastError(
        'BROADCAST_REJECTED',
        verification.reason ?? 'Confirmed Hive operation did not pass verification.',
        'permanent',
      );
    }

    if (input.expectedOperation && !operationsEqual(operation.operation, input.expectedOperation)) {
      throw new HiveBroadcastError(
        'BROADCAST_REJECTED',
        'Confirmed Hive operation does not match the expected operation.',
        'permanent',
      );
    }

    return operation;
  }

  return null;
}

function toConfirmedBroadcastResult(input: {
  network: HiveNetworkConfig;
  operation: NormalizedHiveOperation;
  attempts: number;
  nodeUrl?: string | undefined;
}): ConfirmedBroadcastResult {
  return {
    attempts: input.attempts,
    blockchainTimestamp: input.operation.blockchainTimestamp.toISOString(),
    blockNumber: Number(input.operation.blockNumber),
    confirmationSource: 'haf',
    confirmedAt: new Date().toISOString(),
    network: input.network.name,
    nodeUrl: input.nodeUrl,
    operationIndexes: [input.operation.operationIndex],
    transactionId: input.operation.transactionId,
  };
}

function isAmbiguousBroadcastError(error: HiveBroadcastError) {
  return error.failureClass !== 'permanent';
}

function operationsEqual(left: HiveLoreOperation, right: HiveLoreOperation) {
  return hashCanonicalJson(left) === hashCanonicalJson(right);
}

function normalizeSearchPage(
  page: HafOperationRow[] | { operations: HafOperationRow[]; totalPages?: number },
) {
  return Array.isArray(page) ? { operations: page } : page;
}

function transactionLookupToRows(result: unknown, transactionId: string): HafOperationRow[] | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const transaction = result as {
    block_num?: number | string;
    blockNumber?: number | string;
    block?: number | string;
    expiration?: string;
    operations?: unknown;
    timestamp?: string;
    block_time?: string;
    transaction_id?: string;
    transactionId?: string;
    trx_id?: string;
  };

  if (!Array.isArray(transaction.operations)) {
    return [];
  }

  const resolvedTransactionId =
    transaction.transaction_id ?? transaction.transactionId ?? transaction.trx_id ?? transactionId;
  const timestamp = transaction.timestamp ?? transaction.block_time ?? transaction.expiration;

  return transaction.operations.map((operationValue, index) => {
    const blockNumber = transaction.block_num ?? transaction.blockNumber ?? transaction.block;

    return {
      ...(blockNumber === undefined ? {} : { block_num: blockNumber }),
      operation: normalizeCondenserOperation(operationValue),
      operation_id: index,
      ...(timestamp === undefined ? {} : { timestamp }),
      transaction_id: resolvedTransactionId,
    };
  });
}

function normalizeCondenserOperation(operationValue: unknown): unknown {
  if (Array.isArray(operationValue) && operationValue.length >= 2) {
    const [type, value] = operationValue;

    if (type === 'comment') {
      return { comment_operation: value };
    }

    if (type === 'custom_json') {
      return { custom_json_operation: value };
    }
  }

  return operationValue;
}

function rowMatchesTransaction(row: HafOperationRow, transactionId: string) {
  return (row.transaction_id ?? row.transactionId ?? row.trx_id) === transactionId;
}

function rowMatchesOperationIndex(row: HafOperationRow, operationIndex: number | undefined) {
  if (operationIndex === undefined) {
    return true;
  }

  const rawIndex = row.operation_id ?? row.operationIndex ?? row.op_pos;
  const numericIndex = typeof rawIndex === 'string' ? Number(rawIndex) : rawIndex;

  return numericIndex === operationIndex;
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new HiveBroadcastError(
      'BROADCAST_STATUS_UNKNOWN',
      'Hive broadcast was cancelled.',
      'unknown',
    );
  }
}

function createTimeoutSignal(timeoutMs: number, parentSignal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (parentSignal?.aborted) {
    clearTimeout(timeout);
    controller.abort();
    return controller.signal;
  }

  parentSignal?.addEventListener(
    'abort',
    () => {
      clearTimeout(timeout);
      controller.abort();
    },
    { once: true },
  );

  controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true });

  return controller.signal;
}

const systemClock = {
  now: () => Date.now(),
  random: () => Math.random(),
  sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(
            new HiveBroadcastError(
              'BROADCAST_STATUS_UNKNOWN',
              'Hive broadcast was cancelled.',
              'unknown',
            ),
          );
        },
        { once: true },
      );
    });
  },
};
