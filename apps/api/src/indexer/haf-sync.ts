import type { HafClient } from '../lib/hive/haf-client.js';
import { normalizeHafOperation, projectHiveOperation } from '../lib/hive/projection.js';
import type { HafOperationRow } from '../lib/hive/types.js';

export interface HafSyncDatabase {
  hiveEvent: Parameters<typeof projectHiveOperation>[0]['hiveEvent'];
  indexerWatermark: {
    upsert(args: {
      where: {
        name: string;
      };
      create: {
        name: string;
        lastProcessedBlock: bigint;
        lastProcessedOperationIndex: number;
        lastRunStartedAt?: Date;
        lastRunFinishedAt?: Date;
      };
      update: Partial<{
        lastProcessedBlock: bigint;
        lastProcessedOperationIndex: number;
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
      };
    }): Promise<{
      lastProcessedBlock: bigint;
      lastProcessedOperationIndex: number;
    } | null>;
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
    const fromBlock = Math.max(Number(watermark.lastProcessedBlock), this.startBlock);
    const toBlock = Math.min(headBlock, fromBlock + this.maxBlocksPerRun - 1);

    if (toBlock < fromBlock) {
      await this.markFinished(new Date());

      return {
        fromBlock,
        toBlock,
        headBlock,
        projectedOperations: 0,
      };
    }

    let projectedOperations = 0;
    let page = 1;

    while (true) {
      const response = await this.hafClient.searchBlocks({
        ...(this.operationTypes === undefined ? {} : { operationTypes: this.operationTypes }),
        fromBlock,
        toBlock,
        page,
        pageSize: this.batchSize,
      });
      const rows = response.operations.filter((row) => shouldProcessRow(row, watermark));

      for (const row of rows) {
        const operation = normalizeHafOperation(row);

        await projectHiveOperation(this.database, operation);
        await this.saveWatermark(operation.blockNumber, operation.operationIndex);
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
      toBlock,
      headBlock,
      projectedOperations,
    };
  }

  private async getWatermark(): Promise<{
    lastProcessedBlock: bigint;
    lastProcessedOperationIndex: number;
  }> {
    return (
      (await this.database.indexerWatermark.findUnique({
        where: {
          name: this.name,
        },
        select: {
          lastProcessedBlock: true,
          lastProcessedOperationIndex: true,
        },
      })) ?? {
        lastProcessedBlock: BigInt(this.startBlock),
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
        lastProcessedOperationIndex: -1,
        lastRunFinishedAt: finishedAt,
      },
      update: {
        lastRunFinishedAt: finishedAt,
      },
    });
  }

  private async saveWatermark(blockNumber: bigint, operationIndex: number): Promise<void> {
    await this.database.indexerWatermark.upsert({
      where: {
        name: this.name,
      },
      create: {
        name: this.name,
        lastProcessedBlock: blockNumber,
        lastProcessedOperationIndex: operationIndex,
      },
      update: {
        lastProcessedBlock: blockNumber,
        lastProcessedOperationIndex: operationIndex,
      },
    });
  }
}

function shouldProcessRow(
  row: HafOperationRow,
  watermark: { lastProcessedBlock: bigint; lastProcessedOperationIndex: number },
): boolean {
  const blockNumber = getNumeric(row.block_num ?? row.blockNumber ?? row.block);
  const operationIndex = getNumeric(row.operation_id ?? row.operationIndex ?? row.op_pos);

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
