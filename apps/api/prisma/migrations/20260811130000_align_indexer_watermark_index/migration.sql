-- PostgreSQL truncates identifiers to 63 bytes. The original migration requested
-- the longer Prisma-generated name, which is stored as the shorter mapped name below.
DROP INDEX IF EXISTS "IndexerWatermark_lastProcessedBlock_lastProcessedOperationIndex_idx";

CREATE INDEX "IndexerWatermark_lastProcessedBlock_lastProcessedOperationI_idx"
ON "IndexerWatermark"("lastProcessedBlock", "lastProcessedOperationIndex");
