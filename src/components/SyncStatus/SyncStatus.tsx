import { useEffect, useState } from 'react'
import { db } from '../../db/dexie'
import { supabase, supabaseEnabled } from '../../db/supabase'
import { sendMagicLink, signOut } from '../../db/sync'

export function SyncStatus() {
  const [email, setEmail] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [inputEmail, setInputEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      await sendMagicLink(inputEmail.trim())
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send link')
    } finally {
      setSending(false)
    }
  }

  if (!email) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
        {sent ? (
          <p className="text-neutral-600">Check your email for a sign-in link.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-neutral-500">Sync is off —</span>
            <input
              type="email"
              value={inputEmail}
              onChange={(e) => setInputEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
            <button
              onClick={handleSend}
              disabled={sending || !inputEmail.trim()}
              className="rounded-md bg-neutral-800 px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send sign-in link'}
            </button>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    )
  }

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
