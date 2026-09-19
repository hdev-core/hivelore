-- CreateTable
CREATE TABLE "IndexerWatermark" (
    "name" TEXT NOT NULL,
    "lastProcessedBlock" BIGINT NOT NULL DEFAULT 0,
    "lastProcessedOperationIndex" INTEGER NOT NULL DEFAULT -1,
    "lastRunStartedAt" TIMESTAMP(3),
    "lastRunFinishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerWatermark_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "IndexerWatermark_lastProcessedBlock_lastProcessedOperationIndex_idx" ON "IndexerWatermark"("lastProcessedBlock", "lastProcessedOperationIndex");
