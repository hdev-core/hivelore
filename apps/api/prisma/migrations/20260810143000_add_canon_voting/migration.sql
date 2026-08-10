-- CreateEnum
CREATE TYPE "ProposalDecisionOutcome" AS ENUM ('APPROVED_FOR_PUBLICATION', 'REJECTED', 'NEEDS_REVISION', 'ALTERNATE_TIMELINE', 'STALE_BASE_CONFLICT');

-- AlterEnum
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVISION';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'ALTERNATE_TIMELINE';

-- AlterEnum
ALTER TYPE "VoteChoice" ADD VALUE IF NOT EXISTS 'NEEDS_REVISION';
ALTER TYPE "VoteChoice" ADD VALUE IF NOT EXISTS 'ALTERNATE_TIMELINE';

-- AlterEnum
ALTER TYPE "WorldAuditAction" ADD VALUE IF NOT EXISTS 'CANON_DECISION_FINALIZED';

-- AlterTable
ALTER TABLE "Proposal"
  ADD COLUMN "votingEndsAt" TIMESTAMP(3),
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "aiWarningAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "baseCanonVersionId" TEXT,
  ADD COLUMN "branchParentProposalId" TEXT,
  ADD COLUMN "branchBaseLoreEntryId" TEXT,
  ADD COLUMN "branchLabel" TEXT,
  ADD COLUMN "conflictMetadata" JSONB,
  ADD COLUMN "staleBaseAtDecision" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProposalDecision" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "outcome" "ProposalDecisionOutcome" NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL,
  "rulesVersion" TEXT NOT NULL,
  "payloadSchemaVersion" INTEGER NOT NULL,
  "minimumVotes" INTEGER NOT NULL,
  "approvalThresholdBps" INTEGER NOT NULL,
  "votingWindowHours" INTEGER NOT NULL,
  "approveCount" INTEGER NOT NULL,
  "rejectCount" INTEGER NOT NULL,
  "needsRevisionCount" INTEGER NOT NULL,
  "alternateTimelineCount" INTEGER NOT NULL,
  "totalVotes" INTEGER NOT NULL,
  "approvalNumerator" INTEGER NOT NULL,
  "approvalDenominator" INTEGER NOT NULL,
  "approvalPercentageBps" INTEGER NOT NULL,
  "aiWarningAcknowledged" BOOLEAN NOT NULL DEFAULT false,
  "aiWarningSummary" TEXT,
  "baseCanonVersionId" TEXT,
  "branchParentProposalId" TEXT,
  "branchBaseLoreEntryId" TEXT,
  "branchLabel" TEXT,
  "conflictMetadata" JSONB,
  "staleBaseAtDecision" BOOLEAN NOT NULL DEFAULT false,
  "contentHash" TEXT NOT NULL,
  "decisionPayload" JSONB NOT NULL,
  "decisionPayloadHash" TEXT NOT NULL,
  "customJsonId" TEXT,
  "expectedSigner" TEXT,
  "hiveEventId" TEXT,
  "transactionId" TEXT,
  "blockNumber" BIGINT,
  "operationIndex" INTEGER,
  "blockchainTimestamp" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProposalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDecision_proposalId_key" ON "ProposalDecision"("proposalId");
CREATE UNIQUE INDEX "ProposalDecision_decisionPayloadHash_key" ON "ProposalDecision"("decisionPayloadHash");
CREATE UNIQUE INDEX "ProposalDecision_hiveEventId_key" ON "ProposalDecision"("hiveEventId");
CREATE UNIQUE INDEX "ProposalDecision_transactionId_operationIndex_key" ON "ProposalDecision"("transactionId", "operationIndex");
CREATE INDEX "ProposalDecision_outcome_idx" ON "ProposalDecision"("outcome");
CREATE INDEX "ProposalDecision_decidedAt_idx" ON "ProposalDecision"("decidedAt");
CREATE INDEX "ProposalDecision_customJsonId_idx" ON "ProposalDecision"("customJsonId");
CREATE INDEX "ProposalDecision_baseCanonVersionId_idx" ON "ProposalDecision"("baseCanonVersionId");
CREATE INDEX "ProposalDecision_branchBaseLoreEntryId_idx" ON "ProposalDecision"("branchBaseLoreEntryId");
CREATE INDEX "Proposal_votingEndsAt_idx" ON "Proposal"("votingEndsAt");
CREATE INDEX "Proposal_baseCanonVersionId_idx" ON "Proposal"("baseCanonVersionId");
CREATE INDEX "Proposal_branchBaseLoreEntryId_idx" ON "Proposal"("branchBaseLoreEntryId");

-- AddForeignKey
ALTER TABLE "ProposalDecision" ADD CONSTRAINT "ProposalDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProposalDecision" ADD CONSTRAINT "ProposalDecision_hiveEventId_fkey" FOREIGN KEY ("hiveEventId") REFERENCES "HiveEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
