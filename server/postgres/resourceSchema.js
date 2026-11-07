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
