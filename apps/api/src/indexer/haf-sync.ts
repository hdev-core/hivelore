import type { HafClient } from '../lib/hive/haf-client.js';
import { normalizeHafOperation, projectHiveOperation } from '../lib/hive/projection.js';
import type { HafOperationRow } from '../lib/hive/types.js';

export interface HafSyncDatabase {
  hiveEvent: Parameters<typeof projectHiveOperation>[0]['hiveEvent'] & {
    deleteMany(args: {
      where: {
        blockNumber: {
          gte: bigint;
        };
      };
    }): Promise<{ count: number } | unknown>;
  };
  indexerWatermark: {
    upsert(args: {
      where: {
        name: string;
      };
      create: {
        name: string;
        lastProcessedBlock: bigint;
        lastProcessedOperationIndex: number;
        lastProcessedBlockHash?: string | null;
        lastRunStartedAt?: Date;
        lastRunFinishedAt?: Date;
      };
      update: Partial<{
        lastProcessedBlock: bigint;
        lastProcessedOperationIndex: number;
        lastProcessedBlockHash: string | null;
        lastRunStartedAt: Date;
        lastRunFinishedAt: Date;
      }>;
    }): Promise<unknown>;
    findUnique(args: {
      where: {
        name: string;
      };
      select: {
        lastProcessedBlock: true;
        lastProcessedOperationIndex: true;
        lastProcessedBlockHash: true;
      };
    }): Promise<IndexerWatermark | null>;
  };
}

export interface HafSyncOptions {
  name?: string;
  startBlock?: number;
  batchSize?: number;
  maxBlocksPerRun?: number;
  operationTypes?: number[];
}

export interface HafSyncResult {
  fromBlock: number;
  toBlock: number;
  headBlock: number;
  projectedOperations: number;
  rolledBackEvents: number;
  replayedFromBlock?: number | undefined;
}

interface IndexerWatermark {
  lastProcessedBlock: bigint;
  lastProcessedOperationIndex: number;
  lastProcessedBlockHash: string | null;
}

const DEFAULT_INDEXER_NAME = 'hivelore-haf';
const DEFAULT_START_BLOCK = 1;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BLOCKS_PER_RUN = 1_000;

export class HafSyncService {
  private readonly name: string;
  private readonly startBlock: number;
  private readonly batchSize: number;
  private readonly maxBlocksPerRun: number;
  private readonly operationTypes: number[] | undefined;

  constructor(
    private readonly hafClient: Pick<HafClient, 'getHeadBlock' | 'searchBlocks'>,
    private readonly database: HafSyncDatabase,
    options: HafSyncOptions = {},
  ) {
    this.name = options.name ?? DEFAULT_INDEXER_NAME;
    this.startBlock = options.startBlock ?? DEFAULT_START_BLOCK;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.maxBlocksPerRun = options.maxBlocksPerRun ?? DEFAULT_MAX_BLOCKS_PER_RUN;
    this.operationTypes = options.operationTypes;
  }

  async runOnce(now = new Date()): Promise<HafSyncResult> {
    await this.markStarted(now);

    const [headBlock, watermark] = await Promise.all([
      this.hafClient.getHeadBlock(),
      this.getWatermark(),
    ]);

    return this.syncRange({ headBlock, watermark });
  }

  async replayFromBlock(fromBlock: number, now = new Date()): Promise<HafSyncResult> {
    if (!Number.isInteger(fromBlock) || fromBlock < this.startBlock) {
      throw new Error(`Replay block must be an integer >= ${this.startBlock}.`);
    }

    await this.markStarted(now);

    const [headBlock, rewind] = await Promise.all([
      this.hafClient.getHeadBlock(),
      this.rewindToBlock(fromBlock),
    ]);
    const result = await this.syncRange({
      headBlock,
      watermark: {
        lastProcessedBlock: BigInt(fromBlock),
        lastProcessedBlockHash: null,
        lastProcessedOperationIndex: -1,
      },
    });

    return {
      ...result,
      replayedFromBlock: fromBlock,
      rolledBackEvents: result.rolledBackEvents + rewind.deletedEvents,
    };
  }

  private async syncRange(input: {
    headBlock: number;
    watermark: IndexerWatermark;
  }): Promise<HafSyncResult> {
    let watermark = input.watermark;
    const fromBlock = Math.max(Number(watermark.lastProcessedBlock), this.startBlock);
    const toBlock = Math.min(input.headBlock, fromBlock + this.maxBlocksPerRun - 1);

    if (toBlock < fromBlock) {
      await this.markFinished(new Date());

      return {
        fromBlock,
        headBlock: input.headBlock,
        projectedOperations: 0,
        rolledBackEvents: 0,
        toBlock,
      };
    }

    let projectedOperations = 0;
    let rolledBackEvents = 0;
    let page = 1;

    while (true) {
      const response = await this.hafClient.searchBlocks({
        ...(this.operationTypes === undefined ? {} : { operationTypes: this.operationTypes }),
        fromBlock,
        toBlock,
        page,
        pageSize: this.batchSize,
      });
      const forkBlock = findForkBlock(response.operations, watermark);

      if (forkBlock !== undefined) {
        const rewind = await this.rewindToBlock(forkBlock);

        rolledBackEvents += rewind.deletedEvents;
        watermark = {
          lastProcessedBlock: BigInt(forkBlock),
          lastProcessedBlockHash: null,
          lastProcessedOperationIndex: -1,
        };
      }

      const rows = response.operations.filter((row) => shouldProcessRow(row, watermark));

      for (const row of rows) {
        const operation = normalizeHafOperation(row);

        await projectHiveOperation(this.database, operation);
        await this.saveWatermark(
          operation.blockNumber,
          operation.operationIndex,
          operation.blockHash ?? null,
        );
        projectedOperations += 1;
      }

      if (!hasNextPage(response.page ?? page, response.totalPages, response.operations.length)) {
        break;
      }

      page += 1;
    }

    await this.markFinished(new Date());

    return {
      fromBlock,
      headBlock: input.headBlock,
      projectedOperations,
      rolledBackEvents,
      toBlock,
    };
  }

  private async getWatermark(): Promise<IndexerWatermark> {
    return (
      (await this.database.indexerWatermark.findUnique({
        where: {
          name: this.name,
        },
        select: {
          lastProcessedBlock: true,
          lastProcessedBlockHash: true,
          lastProcessedOperationIndex: true,
        },
      })) ?? {
        lastProcessedBlock: BigInt(this.startBlock),
        lastProcessedBlockHash: null,
        lastProcessedOperationIndex: -1,
      }
    );
  }

  private async markStarted(startedAt: Date): Promise<void> {
    await this.database.indexerWatermark.upsert({
      where: {
        name: this.name,
      },
      create: {
        name: this.name,
        lastProcessedBlock: BigInt(this.startBlock),
        lastProcessedBlockHash: null,
        lastProcessedOperationIndex: -1,
        lastRunStartedAt: startedAt,
      },
      update: {
        lastRunStartedAt: startedAt,
      },
    });
  }

  private async markFinished(finishedAt: Date): Promise<void> {
    await this.database.indexerWatermark.upsert({
      where: {
        name: this.name,
      },
      create: {
        name: this.name,
        lastProcessedBlock: BigInt(this.startBlock),
        lastProcessedBlockHash: null,
        lastProcessedOperationIndex: -1,
        lastRunFinishedAt: finishedAt,
      },
      update: {
        lastRunFinishedAt: finishedAt,
      },
    });
  }

  private async saveWatermark(
    blockNumber: bigint,
    operationIndex: number,
    blockHash: string | null,
  ): Promise<void> {
    await this.database.indexerWatermark.upsert({
      where: {
        name: this.name,
      },
      create: {
        name: this.name,
        lastProcessedBlock: blockNumber,
        lastProcessedBlockHash: blockHash,
        lastProcessedOperationIndex: operationIndex,
      },
      update: {
        lastProcessedBlock: blockNumber,
        lastProcessedBlockHash: blockHash,
        lastProcessedOperationIndex: operationIndex,
      },
    });
  }

  private async rewindToBlock(blockNumber: number): Promise<{ deletedEvents: number }> {
    const deleted = await this.database.hiveEvent.deleteMany({
      where: {
        blockNumber: {
          gte: BigInt(blockNumber),
        },
      },
    });

    await this.saveWatermark(BigInt(blockNumber), -1, null);

    return {
      deletedEvents:
        typeof deleted === 'object' &&
        deleted !== null &&
        'count' in deleted &&
        typeof deleted.count === 'number'
          ? deleted.count
          : 0,
    };
  }
}

function findForkBlock(rows: HafOperationRow[], watermark: IndexerWatermark): number | undefined {
  if (!watermark.lastProcessedBlockHash) {
    return undefined;
  }

  for (const row of rows) {
    const blockNumber = getNumeric(row.block_num ?? row.blockNumber ?? row.block);

    if (blockNumber === undefined || BigInt(blockNumber) < watermark.lastProcessedBlock) {
      continue;
    }

    const blockHash = getHash(row.block_hash ?? row.blockHash ?? row.block_id ?? row.blockId);

    if (BigInt(blockNumber) === watermark.lastProcessedBlock) {
      if (blockHash && blockHash !== watermark.lastProcessedBlockHash) {
        return blockNumber;
      }

      continue;
    }

    const previousBlockHash = getHash(
      row.previous_block_hash ??
        row.previousBlockHash ??
        row.previous ??
        row.prev_block ??
        row.prevBlock,
    );

    if (previousBlockHash && previousBlockHash !== watermark.lastProcessedBlockHash) {
      return blockNumber - 1;
    }
  }

  return undefined;
}

function shouldProcessRow(row: HafOperationRow, watermark: IndexerWatermark): boolean {
  const blockNumber = getNumeric(row.block_num ?? row.blockNumber ?? row.block);
  const operationIndex = getNumeric(
    row.operation_id ?? row.operationIndex ?? row.op_in_trx ?? row.op_pos,
  );

  if (blockNumber === undefined || operationIndex === undefined) {
    return true;
  }

  if (BigInt(blockNumber) > watermark.lastProcessedBlock) {
    return true;
  }

  return (
    BigInt(blockNumber) === watermark.lastProcessedBlock &&
    operationIndex > watermark.lastProcessedOperationIndex
  );
}

function hasNextPage(page: number, totalPages: number | undefined, rowCount: number): boolean {
  if (totalPages !== undefined) {
    return page < totalPages;
  }

  return rowCount > 0;
}

function getNumeric(value: unknown): number | undefined {
  const numericValue = typeof value === 'string' ? Number(value) : value;

  return typeof numericValue === 'number' && Number.isInteger(numericValue)
    ? numericValue
    : undefined;
}

function getHash(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
