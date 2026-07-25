-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WorldRole" AS ENUM ('READER', 'CONTRIBUTOR', 'FOUNDER', 'CURATOR');

-- CreateEnum
CREATE TYPE "WorldAuditAction" AS ENUM ('ROLE_ASSIGNED', 'ROLE_CHANGED', 'ROLE_REMOVED', 'MODERATION_ACTION', 'CANON_STATUS_EXECUTED', 'AI_WARNING_RESOLVED');

-- CreateTable
ALTER TABLE "User" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "WorldMembership" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorldRole" NOT NULL,
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldAuditLog" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "WorldAuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_platformRole_idx" ON "User"("platformRole");

-- CreateIndex
CREATE INDEX "WorldMembership_worldId_role_idx" ON "WorldMembership"("worldId", "role");

-- CreateIndex
CREATE INDEX "WorldMembership_userId_role_idx" ON "WorldMembership"("userId", "role");

-- CreateIndex
CREATE INDEX "WorldMembership_grantedById_idx" ON "WorldMembership"("grantedById");

-- CreateIndex
CREATE INDEX "WorldMembership_revokedAt_idx" ON "WorldMembership"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorldMembership_worldId_userId_key" ON "WorldMembership"("worldId", "userId");

-- CreateIndex
CREATE INDEX "WorldAuditLog_worldId_createdAt_idx" ON "WorldAuditLog"("worldId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldAuditLog_actorId_createdAt_idx" ON "WorldAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldAuditLog_worldId_action_createdAt_idx" ON "WorldAuditLog"("worldId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "WorldAuditLog_targetType_targetId_idx" ON "WorldAuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "WorldMembership" ADD CONSTRAINT "WorldMembership_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldMembership" ADD CONSTRAINT "WorldMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldMembership" ADD CONSTRAINT "WorldMembership_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldAuditLog" ADD CONSTRAINT "WorldAuditLog_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldAuditLog" ADD CONSTRAINT "WorldAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill active FOUNDER memberships for worlds that existed before world memberships.
-- Ambiguous authorization state is rejected instead of silently changing roles or reactivating revoked memberships.
DO $$
DECLARE
    affected_worlds TEXT;
BEGIN
    SELECT string_agg(format('worldId=%s founderId=%s', w."id", COALESCE(w."founderId", '<null>')), E'\n')
    INTO affected_worlds
    FROM "World" w
    LEFT JOIN "User" u ON u."id" = w."founderId"
    WHERE u."id" IS NULL;

    IF affected_worlds IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot backfill founder memberships: one or more worlds have no valid founder user.'
            USING DETAIL = affected_worlds,
                  HINT = 'Restore the missing founder user or assign a valid World.founderId before applying this migration.';
    END IF;

    SELECT string_agg(
        format('worldId=%s founderId=%s membershipId=%s role=%s', w."id", w."founderId", wm."id", wm."role"),
        E'\n'
    )
    INTO affected_worlds
    FROM "World" w
    JOIN "WorldMembership" wm
        ON wm."worldId" = w."id"
        AND wm."userId" = w."founderId"
    WHERE wm."revokedAt" IS NULL
        AND wm."role" <> 'FOUNDER';

    IF affected_worlds IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot backfill founder memberships: one or more founders already have a different active world role.'
            USING DETAIL = affected_worlds,
                  HINT = 'Review each active membership and decide whether the founder should be promoted to FOUNDER manually.';
    END IF;

    SELECT string_agg(
        format('worldId=%s founderId=%s membershipId=%s role=%s revokedAt=%s', w."id", w."founderId", wm."id", wm."role", wm."revokedAt"),
        E'\n'
    )
    INTO affected_worlds
    FROM "World" w
    JOIN "WorldMembership" wm
        ON wm."worldId" = w."id"
        AND wm."userId" = w."founderId"
    WHERE wm."revokedAt" IS NOT NULL;

    IF affected_worlds IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot backfill founder memberships: one or more founder memberships are revoked.'
            USING DETAIL = affected_worlds,
                  HINT = 'Review revoked founder memberships manually; this migration will not reactivate them.';
    END IF;

    INSERT INTO "WorldMembership" (
        "id",
        "worldId",
        "userId",
        "role",
        "grantedById",
        "grantedAt",
        "createdAt",
        "updatedAt"
    )
    SELECT
        gen_random_uuid()::text,
        w."id",
        w."founderId",
        'FOUNDER',
        w."founderId",
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    FROM "World" w
    WHERE NOT EXISTS (
        SELECT 1
        FROM "WorldMembership" wm
        WHERE wm."worldId" = w."id"
            AND wm."userId" = w."founderId"
    )
    ON CONFLICT ("worldId", "userId") DO NOTHING;
END $$;
