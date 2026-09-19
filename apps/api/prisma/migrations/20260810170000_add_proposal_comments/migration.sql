-- Proposal discussion is mutable, off-chain application state. It never determines canon.
ALTER TYPE "ModerationTargetType" ADD VALUE 'PROPOSAL_COMMENT';

CREATE TABLE "ProposalComment" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(3000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "ProposalComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProposalComment_proposalId_createdAt_id_idx" ON "ProposalComment"("proposalId", "createdAt", "id");
CREATE INDEX "ProposalComment_authorId_createdAt_idx" ON "ProposalComment"("authorId", "createdAt");
CREATE INDEX "ProposalComment_deletedById_idx" ON "ProposalComment"("deletedById");

ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_body_not_empty" CHECK (length(btrim("body")) > 0);
