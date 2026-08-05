CREATE TABLE "WorldSeed" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "premise" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "mainConflict" TEXT NOT NULL,
    "startingLocation" TEXT,
    "firstCharacters" JSONB,
    "firstFactions" JSONB,
    "firstHistoricalEvent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldSeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorldSeed_worldId_key" ON "WorldSeed"("worldId");
CREATE INDEX "WorldSeed_genre_idx" ON "WorldSeed"("genre");
CREATE INDEX "WorldSeed_tone_idx" ON "WorldSeed"("tone");

ALTER TABLE "WorldSeed" ADD CONSTRAINT "WorldSeed_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
