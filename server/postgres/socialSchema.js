// Additive and idempotent. Existing favorites stay in the all-saved library.
export const ensureSocialSchema=pool=>pool.query(`
 CREATE TABLE IF NOT EXISTS user_follows (
  follower_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
  followed_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(follower_id,followed_id), CHECK(follower_id<>followed_id)
 );
 CREATE INDEX IF NOT EXISTS user_follows_received_idx ON user_follows(followed_id,created_at DESC,follower_id);
 CREATE TABLE IF NOT EXISTS user_friendships (
  id text PRIMARY KEY,
  user_low text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
  user_high text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
  requester_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_low,user_high), CHECK(user_low<user_high), CHECK(requester_id IN (user_low,user_high))
 );
 CREATE INDEX IF NOT EXISTS user_friendships_low_idx ON user_friendships(user_low,status,updated_at DESC);
 CREATE INDEX IF NOT EXISTS user_friendships_high_idx ON user_friendships(user_high,status,updated_at DESC);
 CREATE TABLE IF NOT EXISTS favorite_collections (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 50),
  description text NOT NULL DEFAULT '' CHECK(char_length(description)<=300),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id)
 );
 CREATE UNIQUE INDEX IF NOT EXISTS favorite_collections_name_idx ON favorite_collections(user_id,lower(name));
 CREATE TABLE IF NOT EXISTS favorite_collection_items (
  collection_id text NOT NULL, user_id text NOT NULL, work_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(collection_id,work_id),
  FOREIGN KEY(collection_id,user_id) REFERENCES favorite_collections(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(work_id,user_id) REFERENCES work_favorites(work_id,user_id) ON DELETE CASCADE
 );
 CREATE INDEX IF NOT EXISTS favorite_collection_items_favorite_idx ON favorite_collection_items(user_id,work_id);
 CREATE TABLE IF NOT EXISTS user_reports (
  id text PRIMARY KEY, reporter_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK(target_type IN ('user','work','post','comment','workComment','resource')),
  target_id text NOT NULL, target_label text NOT NULL, target_url text NOT NULL,
  reason text NOT NULL CHECK(reason IN ('spam','harassment','copyright','inappropriate','fraud','other')),
  details text NOT NULL DEFAULT '' CHECK(char_length(details)<=2000),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  resolution text NOT NULL DEFAULT '' CHECK(char_length(resolution)<=1000),
  resolved_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
 );
 CREATE UNIQUE INDEX IF NOT EXISTS user_reports_open_unique_idx ON user_reports(reporter_id,target_type,target_id) WHERE status='open';
 CREATE INDEX IF NOT EXISTS user_reports_queue_idx ON user_reports(status,created_at DESC,id);
 CREATE INDEX IF NOT EXISTS user_reports_reporter_idx ON user_reports(reporter_id,created_at DESC,id);
`)
