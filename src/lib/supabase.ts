import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Both of these are public by design: they ship to the browser, and Row Level
 * Security on every table is what keeps one person's roadmaps private.
 * Only ever the publishable key here. Supabase's secret key (the one whose
 * name begins "sb_secret_") bypasses RLS entirely and must never reach a
 * browser bundle; it has no use in this app, which has no server.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isConfigured = Boolean(url && key)

/** Null when the app is running without a backend; everything still works locally. */
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export interface ProgressRow {
  item_id: string
  status: string
  updated_at: string
}
