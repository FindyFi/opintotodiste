CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  webauthn_user_id BYTEA NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT false,
  transports TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user_id ON passkey_credentials(user_id);

CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collections_owner_id ON collections(owner_id);

-- A user's saved credentials: each one an immutable snapshot of the signed
-- Verifiable Credential at the time it was saved, not a live pointer back to
-- the uploader's session/Koski data - see src/collections.js. A credential
-- can sit in any number of collections, or in none.
CREATE TABLE IF NOT EXISTS saved_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential JSONB NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_credentials_owner_id ON saved_credentials(owner_id);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  credential_id UUID NOT NULL REFERENCES saved_credentials(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, credential_id)
);

-- Until U9, collection_items held the snapshot itself (id, credential) and
-- each collection had one share_token. Move every snapshot into
-- saved_credentials under the same id, so the collections keep their contents;
-- the old share links stop working. Each step runs only while there is
-- something to migrate: ALTER TABLE locks the table exclusively even when it
-- has nothing to do, which on every boot would deadlock with a request
-- deleting rows while another instance starts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'collection_items' AND column_name = 'credential') THEN
    INSERT INTO saved_credentials (id, owner_id, credential, added_at)
      SELECT i.id, c.owner_id, i.credential, i.added_at
      FROM collection_items i JOIN collections c ON c.id = i.collection_id;
    ALTER TABLE collection_items ADD COLUMN credential_id UUID;
    UPDATE collection_items SET credential_id = id;
    ALTER TABLE collection_items
      DROP COLUMN credential,
      DROP COLUMN id,
      ALTER COLUMN credential_id SET NOT NULL,
      ADD FOREIGN KEY (credential_id) REFERENCES saved_credentials(id) ON DELETE CASCADE,
      ADD PRIMARY KEY (collection_id, credential_id);
    DROP INDEX IF EXISTS idx_collection_items_collection_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'collections' AND column_name = 'share_token') THEN
    ALTER TABLE collections DROP COLUMN share_token;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_collection_items_credential_id ON collection_items(credential_id);

-- Which Koski record a saved credential was signed from (see recordRef in
-- index.js), so the list finds it again whatever the language or the date
-- the signature got. Credentials saved before U18 have none and are matched by
-- their contents instead. Added only while missing, for the same reason as above.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = 'saved_credentials' AND column_name = 'record_ref') THEN
    ALTER TABLE saved_credentials ADD COLUMN record_ref TEXT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_saved_credentials_record_ref ON saved_credentials(owner_id, record_ref);

-- A signed-in user's Koski data: what an import fetched, trimmed as in the
-- session (index.js, minimalKoskiData), with later imports merged in by study
-- right. The list of credentials is converted from it on each request, and
-- signed only when one is needed. `removed` holds the records the user took
-- off the list, until an import brings them back.
CREATE TABLE IF NOT EXISTS koski_imports (
  owner_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  koski_url TEXT NOT NULL,
  data JSONB NOT NULL,
  removed TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One link per recipient (the label names them, e.g. an employer), to either a
-- whole collection or one saved credential. Revoking a link deletes its row;
-- nothing is recorded about who opens a link or when.
CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  credential_id UUID REFERENCES saved_credentials(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((collection_id IS NULL) <> (credential_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_share_links_collection_id ON share_links(collection_id);
CREATE INDEX IF NOT EXISTS idx_share_links_credential_id ON share_links(credential_id);

-- The express-session store. connect-pg-simple can create this itself, but it
-- checks with to_regclass and then creates without IF NOT EXISTS, so several
-- instances starting at once collide on pg_type exactly as the tables above
-- would. Created here instead, under runSchema's advisory lock, with
-- createTableIfMissing left off in index.js. Shape matches the library's own
-- table.sql; an inline PRIMARY KEY yields the same session_pkey constraint.
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);
