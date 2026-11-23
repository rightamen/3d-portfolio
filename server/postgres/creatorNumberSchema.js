import { profile } from '../content.js'
import { inTransaction } from './socialStore.js'

// The owner's reserved number and the random range do not overlap. Reserving a
// candidate with a unique insert makes collisions safe across app processes
// and keeps deleted accounts' numbers from pointing to a new person.
export const ensureCreatorNumberSchema = (pool, ownerEmail = profile.email) =>
  inTransaction(pool, async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS creator_number_reservations (number bigint PRIMARY KEY);
      ALTER TABLE visitor_users ADD COLUMN IF NOT EXISTS creator_number bigint;

      CREATE OR REPLACE FUNCTION allocate_creator_number()
      RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path FROM CURRENT AS $$
      DECLARE
        candidate bigint;
      BEGIN
        LOOP
          candidate := 10000000 + (('x' || left(gen_random_uuid()::text, 7))::bit(28)::bigint % 90000000);
          INSERT INTO creator_number_reservations (number)
          VALUES (candidate) ON CONFLICT DO NOTHING;
          IF FOUND THEN
            RETURN candidate;
          END IF;
        END LOOP;
      END;
      $$;
    `)
    await client.query(`
      WITH owner_account AS (
        SELECT id FROM visitor_users
        WHERE $1 <> '' AND lower(email) = lower($1) AND creator_number IS NULL
          AND NOT EXISTS (SELECT 1 FROM visitor_users WHERE creator_number = 1)
        ORDER BY created_at, id
        LIMIT 1
      )
      UPDATE visitor_users
      SET creator_number = 1
      FROM owner_account
      WHERE visitor_users.id = owner_account.id
    `, [ownerEmail || ''])
    await client.query(`
      UPDATE visitor_users SET creator_number = allocate_creator_number() WHERE creator_number IS NULL;

      ALTER TABLE visitor_users
        ALTER COLUMN creator_number SET DEFAULT allocate_creator_number(),
        ALTER COLUMN creator_number SET NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS visitor_users_creator_number_idx ON visitor_users(creator_number);
    `)
  })
