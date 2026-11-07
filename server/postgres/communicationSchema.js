// Additive, idempotent private communications schema.
export const ensureCommunicationSchema=pool=>pool.query(`
 CREATE TABLE IF NOT EXISTS direct_conversations (
  id text PRIMARY KEY,
  user_low text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
  user_high text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
  requester_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','declined')),
  blocked_low boolean NOT NULL DEFAULT false,
  blocked_high boolean NOT NULL DEFAULT false,
  last_seq integer NOT NULL DEFAULT 0 CHECK(last_seq>=0),
  read_low integer NOT NULL DEFAULT 0 CHECK(read_low>=0),
  read_high integer NOT NULL DEFAULT 0 CHECK(read_high>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_low,user_high),CHECK(user_low<user_high),
  CHECK(requester_id IN(user_low,user_high)),
  CHECK(read_low<=last_seq AND read_high<=last_seq)
 );
 CREATE INDEX IF NOT EXISTS direct_conversations_low_updated_idx ON direct_conversations(user_low,updated_at DESC,id);
 CREATE INDEX IF NOT EXISTS direct_conversations_high_updated_idx ON direct_conversations(user_high,updated_at DESC,id);
 CREATE TABLE IF NOT EXISTS direct_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK(seq>0),
  sender_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id,seq),UNIQUE(sender_id,client_id)
 );
 CREATE INDEX IF NOT EXISTS direct_messages_thread_seq_idx ON direct_messages(conversation_id,seq DESC);
 CREATE INDEX IF NOT EXISTS direct_messages_sender_time_idx ON direct_messages(sender_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS following_feed_reads (
  user_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('work','post','notice','resource')),
  item_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,kind,item_id)
 );
`)
