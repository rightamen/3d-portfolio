export const ensureResourceSchema=pool=>pool.query(`
 ALTER TABLE works ADD COLUMN IF NOT EXISTS resource_type text NOT NULL DEFAULT 'model'
  CHECK(resource_type IN('model','image','video','audio','material','document','other'));
 CREATE INDEX IF NOT EXISTS works_resource_type_published_idx ON works(resource_type,status,published_at DESC);
 CREATE INDEX IF NOT EXISTS work_assets_file_url_idx ON work_assets(file_url);
 DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='work_assets'::regclass AND conname='work_assets_kind_check' AND strpos(pg_get_constraintdef(oid),'video')>0) THEN
   ALTER TABLE work_assets DROP CONSTRAINT IF EXISTS work_assets_kind_check;
   ALTER TABLE work_assets ADD CONSTRAINT work_assets_kind_check CHECK(kind IN('preview','model','source','texture','image','video','audio'));
  END IF;
 END $$;
 ALTER TABLE download_tickets ADD COLUMN IF NOT EXISTS work_asset_id text REFERENCES work_assets(id) ON DELETE CASCADE;
`)

// Works and community uploads use one sequence so a catalogue number always
// identifies a single item. The defaults allocate numbers on concurrent
// inserts; deleting or moderating an item never touches its number.
export const ensureResourceNumberSchema = (pool) => pool.query(`
  CREATE SEQUENCE IF NOT EXISTS resource_number_seq AS bigint;

  ALTER TABLE works ADD COLUMN IF NOT EXISTS resource_number bigint;
  ALTER TABLE community_uploads ADD COLUMN IF NOT EXISTS resource_number bigint;

  WITH pending AS MATERIALIZED (
    SELECT 'work' AS kind, id, created_at FROM works WHERE resource_number IS NULL
    UNION ALL
    SELECT 'upload', id, created_at FROM community_uploads WHERE resource_number IS NULL
    ORDER BY created_at, kind, id
  ), numbered AS MATERIALIZED (
    SELECT kind, id, nextval('resource_number_seq') AS resource_number FROM pending
  ), updated_works AS (
    UPDATE works
    SET resource_number = numbered.resource_number
    FROM numbered
    WHERE numbered.kind = 'work' AND works.id = numbered.id
  )
  UPDATE community_uploads
  SET resource_number = numbered.resource_number
  FROM numbered
  WHERE numbered.kind = 'upload' AND community_uploads.id = numbered.id;

  ALTER TABLE works
    ALTER COLUMN resource_number SET DEFAULT nextval('resource_number_seq'),
    ALTER COLUMN resource_number SET NOT NULL;
  ALTER TABLE community_uploads
    ALTER COLUMN resource_number SET DEFAULT nextval('resource_number_seq'),
    ALTER COLUMN resource_number SET NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS works_resource_number_idx ON works(resource_number);
  CREATE UNIQUE INDEX IF NOT EXISTS community_uploads_resource_number_idx ON community_uploads(resource_number);
`)
