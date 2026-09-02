import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The app must run fully on local storage alone when these are unset (see
// CLAUDE.md) — sync activates automatically once a real project is configured.
export const supabaseEnabled = Boolean(url && anonKey)

export const supabase = supabaseEnabled ? createClient(url, anonKey) : null
