UPDATE "WorldBibleVersion"
SET "publishedAt" = COALESCE("publishedAt", "createdAt")
WHERE "versionNumber" = 1
  AND "publishedAt" IS NULL;
