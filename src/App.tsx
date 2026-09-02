import { useCallback, useEffect, useState } from 'react'
import type { LogEntry, Profile } from './ai/schema'
import { LogInput } from './components/LogInput/LogInput'
import { TodayView } from './components/TodayView/TodayView'
import { HistoryView } from './components/HistoryView/HistoryView'
import { ProfileOnboarding, PROFILE_ID } from './components/ProfileOnboarding/ProfileOnboarding'
import { SyncStatus } from './components/SyncStatus/SyncStatus'
import { useAuthEmail } from './hooks/useAuthEmail'
import { supabaseEnabled } from './db/supabase'
import { db } from './db/dexie'
import { listIfctFoods } from './nutrition/ifct/ifct'

const SKIP_SYNC_KEY = 'my-diet:skip-sync-prompt'

function isToday(isoTimestamp: string): boolean {
  return new Date(isoTimestamp).toDateString() === new Date().toDateString()
}

export default function App() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [knownFoodNames, setKnownFoodNames] = useState<string[]>([])
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [editingProfile, setEditingProfile] = useState(false)
  const [view, setView] = useState<'today' | 'history'>('today')
  const [skippedSignIn, setSkippedSignIn] = useState(() => localStorage.getItem(SKIP_SYNC_KEY) === 'true')
  const { email: authEmail, checked: authChecked } = useAuthEmail()

  const refresh = useCallback(async () => {
    const all = await db.logEntries.toArray()
    setEntries(all.filter((e) => isToday(e.timestamp)).sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
  }, [])

  useEffect(() => {
    refresh()
    db.knownProducts.toArray().then((products) => {
      setKnownFoodNames([...products.map((p) => p.name), ...listIfctFoods().map((f) => f.name)])
    })
    db.profile.get(PROFILE_ID).then((p) => setProfile(p ?? null))
  }, [refresh])

  if (profile === undefined || !authChecked) return null // loading

  // Sign-in gates everything else while it's undecided — but only ever gates,
  // never blocks: "continue without syncing" keeps the app fully usable
  // offline/local-only, per CLAUDE.md's local-first requirement. Once skipped
  // (persisted) or signed in, this never shows again on this device.
  if (supabaseEnabled && !authEmail && !skippedSignIn) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <h1 className="text-xl font-bold text-neutral-900">My Diet</h1>
        <SyncStatus />
        <button
          onClick={() => {
            localStorage.setItem(SKIP_SYNC_KEY, 'true')
            setSkippedSignIn(true)
          }}
          className="text-xs text-neutral-400 hover:text-neutral-600"
        >
          Continue without syncing
        </button>
      </div>
    )
  }

  if (!profile || editingProfile) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <h1 className="text-xl font-bold text-neutral-900">My Diet</h1>
        <SyncStatus />
        <ProfileOnboarding
          existing={profile ?? undefined}
          onSaved={(p) => {
            setProfile(p)
            setEditingProfile(false)
          }}
          onCancel={profile ? () => setEditingProfile(false) : undefined}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">My Diet</h1>
        <button onClick={() => setEditingProfile(true)} className="text-xs text-neutral-400 hover:text-neutral-600">
          edit profile
        </button>
      </div>
      <SyncStatus />
      <LogInput knownFoodNames={knownFoodNames} onSaved={refresh} />

      <div className="flex gap-1 border-b border-neutral-200">
        {(['today', 'history'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-sm font-medium capitalize ${
              view === v ? 'border-b-2 border-emerald-600 text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {view === 'today' ? (
        <TodayView entries={entries} targets={profile.targets} onChanged={refresh} />
      ) : (
        <HistoryView targets={profile.targets} />
      )}
    </div>
  )
}
