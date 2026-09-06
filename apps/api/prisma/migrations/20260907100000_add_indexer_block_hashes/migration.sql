-- Add block linkage metadata so the HAF indexer can detect forked history and replay
-- rebuildable projections from the divergent block.
ALTER TABLE "HiveEvent"
ADD COLUMN "blockHash" TEXT,
ADD COLUMN "previousBlockHash" TEXT;

ALTER TABLE "IndexerWatermark"
ADD COLUMN "lastProcessedBlockHash" TEXT;

CREATE INDEX "HiveEvent_blockHash_idx" ON "HiveEvent"("blockHash");
