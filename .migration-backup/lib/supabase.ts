import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  supabaseUrl?.startsWith('https://') &&
  supabaseUrl?.includes('.supabase.co') &&
  !supabaseUrl?.includes('SEU_PROJETO') &&
  !supabaseAnonKey?.includes('SUA_CHAVE')

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null

export type Board = {
  id: string
  document_state: object | null
  created_at: string
}
