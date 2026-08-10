UPDATE "LoreEntry"
SET "loreType" = 'QUEST'
WHERE "loreType" = 'OTHER'
  AND "content"->>'entityType' = 'QUEST';

UPDATE "LoreEntry"
SET "loreType" = 'STORY'
WHERE "loreType" = 'OTHER'
  AND "content"->>'entityType' = 'STORY_CONTRIBUTION';
