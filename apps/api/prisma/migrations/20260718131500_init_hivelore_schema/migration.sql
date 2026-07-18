-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LoreType" AS ENUM ('CHARACTER', 'LOCATION', 'FACTION', 'EVENT', 'ARTIFACT', 'HISTORY', 'RULE', 'OTHER');

-- CreateEnum
CREATE TYPE "LoreStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED_FOR_PUBLICATION', 'PUBLISHED_CANON', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('ADD_LORE', 'UPDATE_LORE', 'UPDATE_WORLD_BIBLE');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VOTING', 'APPROVED_FOR_PUBLICATION', 'REJECTED', 'PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('APPROVE', 'REJECT', 'ABSTAIN');

-- CreateEnum
CREATE TYPE "AIReportStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ModerationTargetType" AS ENUM ('USER', 'WORLD', 'WORLD_BIBLE_VERSION', 'LORE_ENTRY', 'LORE_RELATIONSHIP', 'PROPOSAL', 'APP_VOTE', 'AI_REPORT', 'HIVE_REFERENCE', 'HIVE_EVENT', 'REWARD_RECORD');

-- CreateEnum
CREATE TYPE "HiveEntityType" AS ENUM ('WORLD_SEED', 'WORLD_BIBLE_VERSION', 'LORE_ENTRY', 'STORY_CHAPTER', 'CANON_DECISION', 'LORE_RELATIONSHIP', 'METADATA');

-- CreateEnum
CREATE TYPE "HiveEventType" AS ENUM ('POST', 'COMMENT', 'CUSTOM_JSON', 'VOTE', 'REWARD', 'BENEFICIARY', 'OTHER');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('AUTHOR', 'CURATION', 'BENEFICIARY', 'OTHER');

-- CreateEnum
CREATE TYPE "SearchEntityType" AS ENUM ('WORLD', 'WORLD_BIBLE_VERSION', 'LORE_ENTRY', 'PROPOSAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "hiveUsername" TEXT NOT NULL,
    "normalizedHiveUsername" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "World_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldBibleVersion" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "creatorId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "changeSummary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "hiveReferenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldBibleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoreEntry" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "loreType" "LoreType" NOT NULL,
    "content" JSONB NOT NULL,
    "status" "LoreStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "hiveReferenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoreEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoreRelationship" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoreRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "proposalType" "ProposalType" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "proposedContent" JSONB NOT NULL,
    "targetLoreEntryId" TEXT,
    "resultingLoreEntryId" TEXT,
    "resultingBibleVersionId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "votingStartedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppVote" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "reputationScoreAtVote" DECIMAL(20,4),
    "reputationSnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIReport" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AIReportStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT,
    "findings" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "worldId" TEXT,
    "proposalId" TEXT,
    "targetType" "ModerationTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ModerationStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiveReference" (
    "id" TEXT NOT NULL,
    "entityType" "HiveEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "hiveAuthorUsername" TEXT NOT NULL,
    "authorId" TEXT,
    "permlink" TEXT NOT NULL,
    "transactionId" TEXT,
    "blockNumber" BIGINT,
    "operationIndex" INTEGER,
    "publicationMetadata" JSONB,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HiveReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiveEvent" (
    "id" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "operationIndex" INTEGER NOT NULL,
    "eventType" "HiveEventType" NOT NULL,
    "blockchainTimestamp" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hiveReferenceId" TEXT,
    "rewardType" "RewardType" NOT NULL,
    "assetSymbol" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "transactionId" TEXT NOT NULL,
    "operationIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "payoutAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRewardSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetSymbol" TEXT NOT NULL,
    "totalAmount" DECIMAL(38,18) NOT NULL,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRewardSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserReputationSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DECIMAL(20,4) NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReputationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchIndex" (
    "id" TEXT NOT NULL,
    "worldId" TEXT,
    "entityType" "SearchEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "searchableContent" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_hiveUsername_key" ON "User"("hiveUsername");

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedHiveUsername_key" ON "User"("normalizedHiveUsername");

-- CreateIndex
CREATE INDEX "User_normalizedHiveUsername_idx" ON "User"("normalizedHiveUsername");

-- CreateIndex
CREATE UNIQUE INDEX "World_slug_key" ON "World"("slug");

-- CreateIndex
CREATE INDEX "World_founderId_idx" ON "World"("founderId");

-- CreateIndex
CREATE INDEX "World_createdAt_idx" ON "World"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldBibleVersion_hiveReferenceId_key" ON "WorldBibleVersion"("hiveReferenceId");

-- CreateIndex
CREATE INDEX "WorldBibleVersion_worldId_versionNumber_idx" ON "WorldBibleVersion"("worldId", "versionNumber");

-- CreateIndex
CREATE INDEX "WorldBibleVersion_creatorId_idx" ON "WorldBibleVersion"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "WorldBibleVersion_worldId_versionNumber_key" ON "WorldBibleVersion"("worldId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LoreEntry_hiveReferenceId_key" ON "LoreEntry"("hiveReferenceId");

-- CreateIndex
CREATE INDEX "LoreEntry_worldId_status_idx" ON "LoreEntry"("worldId", "status");

-- CreateIndex
CREATE INDEX "LoreEntry_worldId_loreType_idx" ON "LoreEntry"("worldId", "loreType");

-- CreateIndex
CREATE INDEX "LoreEntry_authorId_idx" ON "LoreEntry"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "LoreEntry_worldId_slug_key" ON "LoreEntry"("worldId", "slug");

-- CreateIndex
CREATE INDEX "LoreRelationship_worldId_idx" ON "LoreRelationship"("worldId");

-- CreateIndex
CREATE INDEX "LoreRelationship_sourceId_idx" ON "LoreRelationship"("sourceId");

-- CreateIndex
CREATE INDEX "LoreRelationship_targetId_idx" ON "LoreRelationship"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "LoreRelationship_worldId_sourceId_targetId_relationType_key" ON "LoreRelationship"("worldId", "sourceId", "targetId", "relationType");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_resultingBibleVersionId_key" ON "Proposal"("resultingBibleVersionId");

-- CreateIndex
CREATE INDEX "Proposal_worldId_status_idx" ON "Proposal"("worldId", "status");

-- CreateIndex
CREATE INDEX "Proposal_authorId_idx" ON "Proposal"("authorId");

-- CreateIndex
CREATE INDEX "Proposal_targetLoreEntryId_idx" ON "Proposal"("targetLoreEntryId");

-- CreateIndex
CREATE INDEX "AppVote_proposalId_idx" ON "AppVote"("proposalId");

-- CreateIndex
CREATE INDEX "AppVote_voterId_idx" ON "AppVote"("voterId");

-- CreateIndex
CREATE UNIQUE INDEX "AppVote_proposalId_voterId_key" ON "AppVote"("proposalId", "voterId");

-- CreateIndex
CREATE INDEX "AIReport_proposalId_idx" ON "AIReport"("proposalId");

-- CreateIndex
CREATE INDEX "AIReport_status_idx" ON "AIReport"("status");

-- CreateIndex
CREATE INDEX "ModerationReport_reporterId_idx" ON "ModerationReport"("reporterId");

-- CreateIndex
CREATE INDEX "ModerationReport_reviewerId_idx" ON "ModerationReport"("reviewerId");

-- CreateIndex
CREATE INDEX "ModerationReport_worldId_status_idx" ON "ModerationReport"("worldId", "status");

-- CreateIndex
CREATE INDEX "ModerationReport_proposalId_idx" ON "ModerationReport"("proposalId");

-- CreateIndex
CREATE INDEX "ModerationReport_targetType_targetId_idx" ON "ModerationReport"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "HiveReference_authorId_idx" ON "HiveReference"("authorId");

-- CreateIndex
CREATE INDEX "HiveReference_blockNumber_idx" ON "HiveReference"("blockNumber");

-- CreateIndex
CREATE INDEX "HiveReference_publishedAt_idx" ON "HiveReference"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HiveReference_entityType_entityId_key" ON "HiveReference"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "HiveReference_hiveAuthorUsername_permlink_key" ON "HiveReference"("hiveAuthorUsername", "permlink");

-- CreateIndex
CREATE UNIQUE INDEX "HiveReference_transactionId_operationIndex_key" ON "HiveReference"("transactionId", "operationIndex");

-- CreateIndex
CREATE INDEX "HiveEvent_blockNumber_operationIndex_idx" ON "HiveEvent"("blockNumber", "operationIndex");

-- CreateIndex
CREATE INDEX "HiveEvent_eventType_idx" ON "HiveEvent"("eventType");

-- CreateIndex
CREATE INDEX "HiveEvent_blockchainTimestamp_idx" ON "HiveEvent"("blockchainTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "HiveEvent_transactionId_operationIndex_key" ON "HiveEvent"("transactionId", "operationIndex");

-- CreateIndex
CREATE UNIQUE INDEX "RewardRecord_idempotencyKey_key" ON "RewardRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RewardRecord_userId_payoutAt_idx" ON "RewardRecord"("userId", "payoutAt");

-- CreateIndex
CREATE INDEX "RewardRecord_hiveReferenceId_idx" ON "RewardRecord"("hiveReferenceId");

-- CreateIndex
CREATE INDEX "RewardRecord_blockNumber_idx" ON "RewardRecord"("blockNumber");

-- CreateIndex
CREATE INDEX "RewardRecord_transactionId_operationIndex_idx" ON "RewardRecord"("transactionId", "operationIndex");

-- CreateIndex
CREATE INDEX "UserRewardSummary_assetSymbol_idx" ON "UserRewardSummary"("assetSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "UserRewardSummary_userId_assetSymbol_key" ON "UserRewardSummary"("userId", "assetSymbol");

-- CreateIndex
CREATE INDEX "UserReputationSnapshot_userId_calculatedAt_idx" ON "UserReputationSnapshot"("userId", "calculatedAt");

-- CreateIndex
CREATE INDEX "UserReputationSnapshot_calculationVersion_idx" ON "UserReputationSnapshot"("calculationVersion");

-- CreateIndex
CREATE INDEX "SearchIndex_worldId_entityType_idx" ON "SearchIndex"("worldId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "SearchIndex_entityType_entityId_key" ON "SearchIndex"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "World" ADD CONSTRAINT "World_founderId_fkey" FOREIGN KEY ("founderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldBibleVersion" ADD CONSTRAINT "WorldBibleVersion_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldBibleVersion" ADD CONSTRAINT "WorldBibleVersion_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldBibleVersion" ADD CONSTRAINT "WorldBibleVersion_hiveReferenceId_fkey" FOREIGN KEY ("hiveReferenceId") REFERENCES "HiveReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoreEntry" ADD CONSTRAINT "LoreEntry_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoreEntry" ADD CONSTRAINT "LoreEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoreEntry" ADD CONSTRAINT "LoreEntry_hiveReferenceId_fkey" FOREIGN KEY ("hiveReferenceId") REFERENCES "HiveReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoreRelationship" ADD CONSTRAINT "LoreRelationship_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoreRelationship" ADD CONSTRAINT "LoreRelationship_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LoreEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoreRelationship" ADD CONSTRAINT "LoreRelationship_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "LoreEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_targetLoreEntryId_fkey" FOREIGN KEY ("targetLoreEntryId") REFERENCES "LoreEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_resultingLoreEntryId_fkey" FOREIGN KEY ("resultingLoreEntryId") REFERENCES "LoreEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_resultingBibleVersionId_fkey" FOREIGN KEY ("resultingBibleVersionId") REFERENCES "WorldBibleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppVote" ADD CONSTRAINT "AppVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppVote" ADD CONSTRAINT "AppVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppVote" ADD CONSTRAINT "AppVote_reputationSnapshotId_fkey" FOREIGN KEY ("reputationSnapshotId") REFERENCES "UserReputationSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIReport" ADD CONSTRAINT "AIReport_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiveReference" ADD CONSTRAINT "HiveReference_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRecord" ADD CONSTRAINT "RewardRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRecord" ADD CONSTRAINT "RewardRecord_hiveReferenceId_fkey" FOREIGN KEY ("hiveReferenceId") REFERENCES "HiveReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRewardSummary" ADD CONSTRAINT "UserRewardSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReputationSnapshot" ADD CONSTRAINT "UserReputationSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchIndex" ADD CONSTRAINT "SearchIndex_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
