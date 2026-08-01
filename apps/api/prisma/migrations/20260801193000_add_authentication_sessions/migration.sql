-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('KEYCHAIN', 'HIVESIGNER');

-- CreateEnum
CREATE TYPE "ExternalIdentityProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "HiveProvisioningStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "RcDelegationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'NOT_CONFIGURED');

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "normalizedHiveUsername" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "intent" TEXT NOT NULL DEFAULT 'authentication',
    "challengeHash" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionFamilyId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentityLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ExternalIdentityProvider" NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "verifiedEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiveProvisioningRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "externalIdentityLinkId" TEXT,
    "requestedHiveUsername" TEXT NOT NULL,
    "status" "HiveProvisioningStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HiveProvisioningRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RcDelegation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hiveUsername" TEXT NOT NULL,
    "delegatorAccount" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "status" "RcDelegationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "transactionId" TEXT,
    "operationIndex" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RcDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_challengeHash_key" ON "AuthChallenge"("challengeHash");

-- CreateIndex
CREATE INDEX "AuthChallenge_normalizedHiveUsername_provider_idx" ON "AuthChallenge"("normalizedHiveUsername", "provider");

-- CreateIndex
CREATE INDEX "AuthChallenge_expiresAt_idx" ON "AuthChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthChallenge_consumedAt_idx" ON "AuthChallenge"("consumedAt");

-- CreateIndex
CREATE INDEX "AuthChallenge_userId_idx" ON "AuthChallenge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_refreshTokenHash_key" ON "RefreshSession"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_replacedById_key" ON "RefreshSession"("replacedById");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");

-- CreateIndex
CREATE INDEX "RefreshSession_sessionFamilyId_idx" ON "RefreshSession"("sessionFamilyId");

-- CreateIndex
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

-- CreateIndex
CREATE INDEX "RefreshSession_revokedAt_idx" ON "RefreshSession"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentityLink_provider_providerSubject_key" ON "ExternalIdentityLink"("provider", "providerSubject");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentityLink_userId_provider_key" ON "ExternalIdentityLink"("userId", "provider");

-- CreateIndex
CREATE INDEX "ExternalIdentityLink_userId_idx" ON "ExternalIdentityLink"("userId");

-- CreateIndex
CREATE INDEX "HiveProvisioningRequest_userId_idx" ON "HiveProvisioningRequest"("userId");

-- CreateIndex
CREATE INDEX "HiveProvisioningRequest_externalIdentityLinkId_idx" ON "HiveProvisioningRequest"("externalIdentityLinkId");

-- CreateIndex
CREATE INDEX "HiveProvisioningRequest_status_idx" ON "HiveProvisioningRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RcDelegation_idempotencyKey_key" ON "RcDelegation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RcDelegation_userId_idx" ON "RcDelegation"("userId");

-- CreateIndex
CREATE INDEX "RcDelegation_hiveUsername_idx" ON "RcDelegation"("hiveUsername");

-- CreateIndex
CREATE INDEX "RcDelegation_status_idx" ON "RcDelegation"("status");

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentityLink" ADD CONSTRAINT "ExternalIdentityLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiveProvisioningRequest" ADD CONSTRAINT "HiveProvisioningRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiveProvisioningRequest" ADD CONSTRAINT "HiveProvisioningRequest_externalIdentityLinkId_fkey" FOREIGN KEY ("externalIdentityLinkId") REFERENCES "ExternalIdentityLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcDelegation" ADD CONSTRAINT "RcDelegation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
