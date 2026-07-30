import type { HafOperationRow, HiveLoreOperation, NormalizedHiveOperation } from './types.js';

type HiveProjectionEventType = 'COMMENT' | 'CUSTOM_JSON';

export interface HiveProjectionDatabase {
  hiveEvent: {
    upsert(args: {
      where: { transactionId_operationIndex: { transactionId: string; operationIndex: number } };
      create: {
        blockNumber: bigint;
        transactionId: string;
        operationIndex: number;
        eventType: HiveProjectionEventType;
        blockchainTimestamp: Date;
        payload: unknown;
      };
      update: {
        blockNumber: bigint;
        eventType: HiveProjectionEventType;
        blockchainTimestamp: Date;
        payload: unknown;
      };
    }): Promise<unknown>;
  };
}

export function normalizeHafOperation(row: HafOperationRow): NormalizedHiveOperation {
  const operation = unwrapHafOperation(row);
  const operationType = getOperationType(operation);

  if (!operationType) {
    throw new Error('HAF row does not contain a supported HiveLore operation.');
  }

  return {
    blockNumber: BigInt(
      requiredNumeric(row.block_num ?? row.blockNumber ?? row.block, 'block number'),
    ),
    transactionId: requiredString(
      row.transaction_id ?? row.transactionId ?? row.trx_id,
      'transaction id',
    ),
    operationIndex: requiredNumeric(
      row.operation_id ?? row.operationIndex ?? row.op_pos,
      'operation index',
    ),
    blockchainTimestamp: new Date(requiredString(row.timestamp ?? row.created_at, 'timestamp')),
    operationType,
    operation,
  };
}

export async function projectHiveOperation(
  database: HiveProjectionDatabase,
  operation: NormalizedHiveOperation,
): Promise<void> {
  await database.hiveEvent.upsert({
    where: {
      transactionId_operationIndex: {
        transactionId: operation.transactionId,
        operationIndex: operation.operationIndex,
      },
    },
    create: {
      blockNumber: operation.blockNumber,
      transactionId: operation.transactionId,
      operationIndex: operation.operationIndex,
      eventType: toHiveEventType(operation.operationType),
      blockchainTimestamp: operation.blockchainTimestamp,
      payload: operation.operation,
    },
    update: {
      blockNumber: operation.blockNumber,
      eventType: toHiveEventType(operation.operationType),
      blockchainTimestamp: operation.blockchainTimestamp,
      payload: operation.operation,
    },
  });
}

function unwrapHafOperation(row: HafOperationRow): HiveLoreOperation {
  const source = row.operation ?? row.op ?? row.body;

  if (!source || typeof source !== 'object') {
    throw new Error('HAF row did not include operation payload.');
  }

  if ('comment_operation' in source || 'custom_json_operation' in source) {
    return source as HiveLoreOperation;
  }

  if ('type' in source && 'value' in source) {
    const typedOperation = source as { type: unknown; value: unknown };

    if (typedOperation.type === 'comment_operation') {
      return {
        comment_operation: typedOperation.value as HiveLoreOperation['comment_operation'],
      };
    }

    if (typedOperation.type === 'custom_json_operation') {
      return {
        custom_json_operation: typedOperation.value as HiveLoreOperation['custom_json_operation'],
      };
    }
  }

  if ('comment' in source) {
    return {
      comment_operation: (source as { comment: unknown })
        .comment as HiveLoreOperation['comment_operation'],
    };
  }

  if ('custom_json' in source) {
    return {
      custom_json_operation: (source as { custom_json: unknown })
        .custom_json as HiveLoreOperation['custom_json_operation'],
    };
  }

  throw new Error('HAF row operation payload is not supported.');
}

function getOperationType(
  operation: HiveLoreOperation,
): NormalizedHiveOperation['operationType'] | null {
  if (operation.comment_operation) {
    return 'comment';
  }

  if (operation.custom_json_operation) {
    return 'custom_json';
  }

  return null;
}

function toHiveEventType(
  operationType: NormalizedHiveOperation['operationType'],
): HiveProjectionEventType {
  return operationType === 'comment' ? 'COMMENT' : 'CUSTOM_JSON';
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`HAF row did not include ${label}.`);
  }

  return value;
}

function requiredNumeric(value: unknown, label: string): number {
  const numericValue = typeof value === 'string' ? Number(value) : value;

  if (typeof numericValue !== 'number' || !Number.isInteger(numericValue)) {
    throw new Error(`HAF row did not include valid ${label}.`);
  }

  return numericValue;
}
