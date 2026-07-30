import { parseHiveLoreCommentMetadata, parseHiveLoreCustomJsonPayload } from './operations.js';
import type { HiveLoreOperation, HiveOperationVerification } from './types.js';

export function verifyHiveLoreOperation(input: {
  operation: HiveLoreOperation;
  expectedSigner?: string;
}): HiveOperationVerification {
  const customJsonPayload = parseHiveLoreCustomJsonPayload(input.operation);

  if (customJsonPayload) {
    const actualSigner = getCustomJsonSigner(input.operation);
    const expectedSigner = input.expectedSigner?.trim().toLowerCase();

    if (expectedSigner && actualSigner !== expectedSigner) {
      return {
        ok: false,
        reason: 'Signer does not match expected Hive account.',
      };
    }

    if (actualSigner !== customJsonPayload.signer) {
      return {
        ok: false,
        reason: 'custom_json signer does not match HiveLore payload signer.',
      };
    }

    return {
      ok: true,
      signer: actualSigner,
      entityType: customJsonPayload.entityType,
      entityId: customJsonPayload.entityId,
      payload: customJsonPayload,
    };
  }

  const commentMetadata = parseHiveLoreCommentMetadata(input.operation);

  if (commentMetadata && input.operation.comment_operation) {
    const actualSigner = input.operation.comment_operation.author;
    const expectedSigner = input.expectedSigner?.trim().toLowerCase();

    if (expectedSigner && actualSigner !== expectedSigner) {
      return {
        ok: false,
        reason: 'Comment author does not match expected Hive account.',
      };
    }

    return {
      ok: true,
      signer: actualSigner,
      entityType: commentMetadata.hivelore.entityType,
      entityId: commentMetadata.hivelore.entityId,
      payload: commentMetadata,
    };
  }

  return {
    ok: false,
    reason: 'Operation is not a verified HiveLore comment or custom_json payload.',
  };
}

function getCustomJsonSigner(operation: HiveLoreOperation): string {
  const customJson = operation.custom_json_operation;

  if (!customJson) {
    return '';
  }

  const signer = customJson.required_posting_auths[0] ?? customJson.required_auths[0];

  return signer?.trim().toLowerCase() ?? '';
}
