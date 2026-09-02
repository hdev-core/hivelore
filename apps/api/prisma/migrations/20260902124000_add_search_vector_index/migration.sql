ALTER TABLE "SearchIndex"
ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("searchableContent", '')), 'B')
) STORED;

CREATE INDEX "SearchIndex_searchVector_idx" ON "SearchIndex" USING GIN ("searchVector");
