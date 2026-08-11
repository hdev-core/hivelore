WITH repaired AS (
  UPDATE "LoreEntry"
  SET "loreType" = CASE
    WHEN "content"->>'entityType' = 'QUEST' THEN 'QUEST'::"LoreType"
    WHEN "content"->>'entityType' = 'STORY_CONTRIBUTION' THEN 'STORY'::"LoreType"
    ELSE "loreType"
  END
  WHERE "status" = 'PUBLISHED_CANON'
    AND "loreType" = 'OTHER'
    AND "content"->>'entityType' IN ('QUEST', 'STORY_CONTRIBUTION')
  RETURNING
    "id",
    "worldId",
    "loreType",
    "content"->>'entityType' AS "entityType"
)
INSERT INTO "WorldAuditLog" (
  "id",
  "worldId",
  "actorId",
  "action",
  "targetType",
  "targetId",
  "metadata",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  repaired."worldId",
  NULL,
  'LORE_ENTRY_UPDATED',
  'LORE_ENTRY',
  repaired."id",
  jsonb_build_object(
    'reason', 'Corrected a published canon lore type that still used OTHER after the QUEST/STORY type split.',
    'migration', '20260810190000_repair_published_canon_quest_story_lore_types',
    'loreType', repaired."loreType",
    'entityType', repaired."entityType"
  ),
  CURRENT_TIMESTAMP
FROM repaired
WHERE NOT EXISTS (
  SELECT 1
  FROM "WorldAuditLog"
  WHERE "WorldAuditLog"."targetType" = 'LORE_ENTRY'
    AND "WorldAuditLog"."targetId" = repaired."id"
    AND "WorldAuditLog"."action" = 'LORE_ENTRY_UPDATED'
    AND "WorldAuditLog"."metadata"->>'migration' =
      '20260810190000_repair_published_canon_quest_story_lore_types'
);
