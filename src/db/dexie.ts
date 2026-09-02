import Dexie, { type EntityTable } from 'dexie'
import type { KnownProduct, LogEntry, Profile } from '../ai/schema'
import knownProductsSeed from '../nutrition/known-products.seed.json'

export const db = new Dexie('my-diet') as Dexie & {
  logEntries: EntityTable<LogEntry, 'id'>
  knownProducts: EntityTable<KnownProduct, 'id'>
  profile: EntityTable<Profile, 'id'>
}

db.version(1).stores({
  logEntries: 'id, timestamp, updatedAt',
  knownProducts: 'id, name, lastUpdated',
  profile: 'id',
})

// Seed the user's own scanned-product library once, on first run.
db.on('populate', () => {
  db.knownProducts.bulkAdd(knownProductsSeed.products as KnownProduct[])
})
