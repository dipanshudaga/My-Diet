import Dexie, { type EntityTable } from 'dexie'
import type { KnownProduct, LogEntry, Profile } from '../ai/schema'
import knownProductsSeed from '../nutrition/known-products.seed.json'

export type SyncTable = 'logEntries' | 'knownProducts' | 'profile'

export interface SyncQueueItem {
  id: string // `${table}:${recordId}` — re-queuing the same record just overwrites this row
  table: SyncTable
  recordId: string
  op: 'upsert' | 'delete'
  queuedAt: string
}

export const db = new Dexie('my-diet') as Dexie & {
  logEntries: EntityTable<LogEntry, 'id'>
  knownProducts: EntityTable<KnownProduct, 'id'>
  profile: EntityTable<Profile, 'id'>
  syncQueue: EntityTable<SyncQueueItem, 'id'>
}

db.version(1).stores({
  logEntries: 'id, timestamp, updatedAt',
  knownProducts: 'id, name, lastUpdated',
  profile: 'id',
})

db.version(2).stores({
  logEntries: 'id, timestamp, updatedAt',
  knownProducts: 'id, name, lastUpdated',
  profile: 'id',
  syncQueue: 'id, table',
})

// Seed the user's own scanned-product library once, on first run.
db.on('populate', () => {
  db.knownProducts.bulkAdd(knownProductsSeed.products as KnownProduct[])
})
