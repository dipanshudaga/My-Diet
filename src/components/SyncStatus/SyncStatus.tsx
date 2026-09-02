import { useEffect, useState } from 'react'
import { db } from '../../db/dexie'
import { supabase, supabaseEnabled } from '../../db/supabase'
import { sendMagicLink, signOut } from '../../db/sync'

export function SyncStatus() {
  const [email, setEmail] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    if (!supabaseEnabled || !supabase) {
      setChecked(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null)
      setChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabaseEnabled) return
    const interval = setInterval(() => {
      db.syncQueue.count().then(setPending)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  if (!supabaseEnabled || !checked) return null

  if (!email) return <SignInForm />

  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500">
      <span>
        Synced as {email}
        {pending > 0 && ` · ${pending} pending`}
      </span>
      <button onClick={() => signOut()} className="text-neutral-400 hover:text-neutral-600">
        sign out
      </button>
    </div>
  )
}

function SignInForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    setError(null)
    setBusy(true)
    try {
      await sendMagicLink(email)
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send sign-in link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">Sign in to sync</h2>

      {sent ? (
        <p className="text-sm text-neutral-600">Check your email and tap the sign-in link.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="you@gmail.com"
            className="min-w-48 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={busy || !email.trim()}
            className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send link'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
