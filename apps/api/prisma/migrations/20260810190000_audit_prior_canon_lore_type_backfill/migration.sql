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
  "LoreEntry"."worldId",
  NULL,
  'LORE_ENTRY_UPDATED',
  'LORE_ENTRY',
  "LoreEntry"."id",
  jsonb_build_object(
    'reason', 'Audit trail for published canon rows that may have been touched by the earlier QUEST/STORY lore type backfill before it was scoped to non-canon rows.',
    'migration', '20260810190000_audit_prior_canon_lore_type_backfill',
    'loreType', "LoreEntry"."loreType",
    'entityType', "LoreEntry"."content"->>'entityType'
  ),
  CURRENT_TIMESTAMP
FROM "LoreEntry"
WHERE "LoreEntry"."status" = 'PUBLISHED_CANON'
  AND (
    ("LoreEntry"."loreType" = 'QUEST' AND "LoreEntry"."content"->>'entityType' = 'QUEST')
    OR (
      "LoreEntry"."loreType" = 'STORY'
      AND "LoreEntry"."content"->>'entityType' = 'STORY_CONTRIBUTION'
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "WorldAuditLog"
    WHERE "WorldAuditLog"."targetType" = 'LORE_ENTRY'
      AND "WorldAuditLog"."targetId" = "LoreEntry"."id"
      AND "WorldAuditLog"."action" = 'LORE_ENTRY_UPDATED'
      AND "WorldAuditLog"."metadata"->>'migration' =
        '20260810190000_audit_prior_canon_lore_type_backfill'
  );
