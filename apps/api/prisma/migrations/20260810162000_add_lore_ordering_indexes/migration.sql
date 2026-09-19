-- Support deterministic lore list and relation projections.
CREATE INDEX "LoreEntry_worldId_updatedAt_id_idx" ON "LoreEntry"("worldId", "updatedAt", "id");
CREATE INDEX "LoreRelationship_sourceId_updatedAt_id_idx" ON "LoreRelationship"("sourceId", "updatedAt", "id");
CREATE INDEX "LoreRelationship_targetId_updatedAt_id_idx" ON "LoreRelationship"("targetId", "updatedAt", "id");
