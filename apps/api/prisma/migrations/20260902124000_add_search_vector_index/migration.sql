ALTER TABLE "SearchIndex"
ADD COLUMN "searchVector" tsvector;

CREATE FUNCTION update_search_index_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."searchableContent", '')), 'B');
  RETURN NEW;
END;
$$;

CREATE TRIGGER "SearchIndex_searchVector_update"
BEFORE INSERT OR UPDATE OF "title", "searchableContent"
ON "SearchIndex"
FOR EACH ROW
EXECUTE FUNCTION update_search_index_vector();

UPDATE "SearchIndex"
SET "searchVector" =
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("searchableContent", '')), 'B');

CREATE INDEX "SearchIndex_searchVector_idx" ON "SearchIndex" USING GIN ("searchVector");
