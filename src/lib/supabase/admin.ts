import 'server-only'
import { createClient } from '@supabase/supabase-js'

/** Service role client. Bypasses row level security. Use only for invites and account linking. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
