-- Nullable metadata keeps old digests readable without forcing a historical rewrite.
ALTER TABLE story_digests ADD COLUMN cited_article_ids text[];
ALTER TABLE story_digests ADD COLUMN latest_article_id text;
