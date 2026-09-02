import { useEffect, useState } from 'react'
import { supabase, supabaseEnabled } from '../db/supabase'

// Shared auth-state tracking — used by SyncStatus for its own display, and
// lifted into App.tsx, which needs sign-in status to decide whether to gate
// the whole app behind sign-in.
export function useAuthEmail(): { email: string | null; checked: boolean } {
  const [email, setEmail] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

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

  return { email, checked }
}
