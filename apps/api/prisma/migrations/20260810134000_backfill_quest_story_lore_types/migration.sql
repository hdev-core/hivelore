UPDATE "LoreEntry"
SET "loreType" = 'QUEST'
WHERE "loreType" = 'OTHER'
  AND "status" <> 'PUBLISHED_CANON'
  AND "content"->>'entityType' = 'QUEST';

UPDATE "LoreEntry"
SET "loreType" = 'STORY'
WHERE "loreType" = 'OTHER'
  AND "status" <> 'PUBLISHED_CANON'
  AND "content"->>'entityType' = 'STORY_CONTRIBUTION';
