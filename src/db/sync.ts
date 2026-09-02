import type { KnownProduct, LogEntry, Profile } from '../ai/schema'
import { db, type SyncTable } from './dexie'
import { supabase, supabaseEnabled } from './supabase'

// Local write -> queue -> flush to Supabase when online and signed in. This is a
// durable backup / future cross-device copy, not the primary store — Dexie is
// always the source of truth and every write already landed there synchronously
// before any of this runs. Deliberately push-only for now (no pull/merge-on-signin):
// CLAUDE.md's sync pattern only describes the push direction, and a second device
// restoring from Supabase is a real but separate feature to add if it's ever needed.
const SUPABASE_TABLE: Record<SyncTable, string> = {
  logEntries: 'log_entries',
  knownProducts: 'known_products',
  profile: 'profile',
}

let userId: string | null = null
let flushing = false

// Dexie's .hook() overloads are keyed on the literal event name, so a generic
// helper over table type can't resolve the right one — wired explicitly instead.
function wireHooks() {
  db.logEntries.hook('creating', function (primKey) {
    this.onsuccess = () => enqueue('logEntries', String(primKey), 'upsert')
  })
  db.logEntries.hook('updating', function (_mods, primKey) {
    this.onsuccess = () => enqueue('logEntries', String(primKey), 'upsert')
  })
  db.logEntries.hook('deleting', function (primKey) {
    this.onsuccess = () => enqueue('logEntries', String(primKey), 'delete')
  })

  db.knownProducts.hook('creating', function (primKey) {
    this.onsuccess = () => enqueue('knownProducts', String(primKey), 'upsert')
  })
  db.knownProducts.hook('updating', function (_mods, primKey) {
    this.onsuccess = () => enqueue('knownProducts', String(primKey), 'upsert')
  })
  db.knownProducts.hook('deleting', function (primKey) {
    this.onsuccess = () => enqueue('knownProducts', String(primKey), 'delete')
  })

  db.profile.hook('creating', function (primKey) {
    this.onsuccess = () => enqueue('profile', String(primKey), 'upsert')
  })
  db.profile.hook('updating', function (_mods, primKey) {
    this.onsuccess = () => enqueue('profile', String(primKey), 'upsert')
  })
  db.profile.hook('deleting', function (primKey) {
    this.onsuccess = () => enqueue('profile', String(primKey), 'delete')
  })
}

async function enqueue(table: SyncTable, recordId: string, op: 'upsert' | 'delete') {
  await db.syncQueue.put({ id: `${table}:${recordId}`, table, recordId, op, queuedAt: new Date().toISOString() })
  flushSyncQueue()
}

function toRow(table: SyncTable, record: LogEntry | KnownProduct | Profile, uid: string): Record<string, unknown> {
  switch (table) {
    case 'logEntries': {
      const r = record as LogEntry
      return {
        id: r.id, user_id: uid, timestamp: r.timestamp, meal_context: r.mealContext ?? null,
        raw_input: r.rawInput, parsed_items: r.parsedItems, totals: r.totals, status: r.status,
        updated_at: r.updatedAt,
      }
    }
    case 'knownProducts': {
      const r = record as KnownProduct
      return { id: r.id, user_id: uid, name: r.name, per100g: r.per100g, source: r.source, updated_at: r.lastUpdated }
    }
    case 'profile': {
      const r = record as Profile
      return {
        id: r.id, user_id: uid, age: r.age, sex: r.sex, height_cm: r.heightCm, weight_kg: r.weightKg,
        activity_days_per_week: r.activityDaysPerWeek, goal: r.goal, targets: r.targets, updated_at: r.updatedAt,
      }
    }
  }
}

export async function flushSyncQueue(): Promise<void> {
  if (!supabase || !userId || !navigator.onLine || flushing) return
  flushing = true
  try {
    const items = await db.syncQueue.toArray()
    for (const item of items) {
      try {
        if (item.op === 'delete') {
          await supabase.from(SUPABASE_TABLE[item.table]).delete().eq('id', item.recordId)
        } else {
          const record = await db[item.table].get(item.recordId)
          if (!record) {
            await db.syncQueue.delete(item.id)
            continue
          }
          const { error } = await supabase.from(SUPABASE_TABLE[item.table]).upsert(toRow(item.table, record, userId))
          if (error) throw error
        }
        await db.syncQueue.delete(item.id)
      } catch {
        // Leave it queued — retried on the next flush (reconnect, next boot, next write).
      }
    }
  } finally {
    flushing = false
  }
}

export function getSyncUserId(): string | null {
  return userId
}

// Magic-link auth for the single owner account — no password/signup UI needed.
export async function sendMagicLink(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.auth.signInWithOtp({ email })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}

export function initSync(onAuthChange?: (email: string | null) => void): void {
  if (!supabaseEnabled || !supabase) return

  wireHooks()

  supabase.auth.onAuthStateChange((_event, session) => {
    userId = session?.user.id ?? null
    onAuthChange?.(session?.user.email ?? null)
    if (userId) flushSyncQueue()
  })

  window.addEventListener('online', () => flushSyncQueue())
}
