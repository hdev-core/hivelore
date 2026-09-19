-- CreateEnum
CREATE TYPE "ContributionKind" AS ENUM ('LORE', 'STORY');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterEnum
ALTER TYPE "ProposalType" ADD VALUE 'ADD_STORY';

-- AlterEnum
ALTER TYPE "WorldAuditAction" ADD VALUE 'CONTRIBUTION_CREATED';
ALTER TYPE "WorldAuditAction" ADD VALUE 'CONTRIBUTION_UPDATED';
ALTER TYPE "WorldAuditAction" ADD VALUE 'CONTRIBUTION_DELETED';
ALTER TYPE "WorldAuditAction" ADD VALUE 'CONTRIBUTION_SUBMITTED';
ALTER TYPE "WorldAuditAction" ADD VALUE 'PROPOSAL_CREATED';

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN "contributionKind" "ContributionKind";

-- CreateTable
CREATE TABLE "ContributionDraft" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "targetLoreEntryId" TEXT,
    "kind" "ContributionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" JSONB NOT NULL,
    "status" "ContributionStatus" NOT NULL DEFAULT 'DRAFT',
    "proposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "ContributionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContributionDraft_proposalId_key" ON "ContributionDraft"("proposalId");

-- CreateIndex
CREATE INDEX "ContributionDraft_worldId_idx" ON "ContributionDraft"("worldId");

-- CreateIndex
CREATE INDEX "ContributionDraft_authorId_idx" ON "ContributionDraft"("authorId");

-- CreateIndex
CREATE INDEX "ContributionDraft_worldId_status_idx" ON "ContributionDraft"("worldId", "status");

-- CreateIndex
CREATE INDEX "ContributionDraft_worldId_authorId_status_idx" ON "ContributionDraft"("worldId", "authorId", "status");

-- CreateIndex
CREATE INDEX "ContributionDraft_targetLoreEntryId_idx" ON "ContributionDraft"("targetLoreEntryId");

-- CreateIndex
CREATE INDEX "Proposal_worldId_contributionKind_idx" ON "Proposal"("worldId", "contributionKind");

-- AddForeignKey
ALTER TABLE "ContributionDraft" ADD CONSTRAINT "ContributionDraft_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionDraft" ADD CONSTRAINT "ContributionDraft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionDraft" ADD CONSTRAINT "ContributionDraft_targetLoreEntryId_fkey" FOREIGN KEY ("targetLoreEntryId") REFERENCES "LoreEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionDraft" ADD CONSTRAINT "ContributionDraft_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
