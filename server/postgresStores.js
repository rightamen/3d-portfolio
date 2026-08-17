import pg from 'pg'
import { ensureSchema } from './postgres/schema.js'
import { createAdminStore } from './postgres/adminStore.js'
import { createAuthStore } from './postgres/authStore.js'
import { createCommunityStore } from './postgres/communityStore.js'
import { createContactMessagesStore } from './postgres/contactMessagesStore.js'
import { createDownloadRequestsStore } from './postgres/downloadRequestsStore.js'
import { createInteractionsStore } from './postgres/interactionsStore.js'
import { createProjectStore } from './postgres/projectStore.js'

const { Pool } = pg

export const createPostgresStores = async (databaseUrl) => {
  // Several writes (toggleLike, toggleCommentLike, profile moderation) hold a
  // dedicated client for the length of a transaction. A pool of 2 meant two
  // concurrent likes could starve every other query until connectionTimeoutMillis.
  const pool = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  })

  await ensureSchema(pool)

  // adminStore is the only store that reaches into another: its overview counts
  // the catalogue, which lives behind projectStore's base-project merge.
  const projectStore = createProjectStore({ pool })

  return {
    adminStore: createAdminStore({ pool, projectStore }),
    authStore: createAuthStore({ pool }),
    close: () => pool.end(),
    communityStore: createCommunityStore({ pool }),
    contactMessagesStore: createContactMessagesStore({ pool }),
    downloadRequestsStore: createDownloadRequestsStore({ pool }),
    interactionsStore: createInteractionsStore({ pool }),
    projectStore,
  }
}
