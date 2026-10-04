// One-off: creates the coach login and coach record.
// Usage: npx tsx --env-file=.env.local scripts/create-coach.mts "Name" coach@example.com 'a-long-password'
import { createClient } from '@supabase/supabase-js'

const [name, email, password] = process.argv.slice(2)
if (!name || !email || !password || password.length < 12) {
  console.error('Usage: create-coach.mts "Name" email password (password at least 12 characters)')
  process.exit(1)
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (error || !data.user) throw error ?? new Error('No user returned')
const { error: coachError } = await admin.from('coach').insert({ user_id: data.user.id, name })
if (coachError) throw coachError
console.log(`Coach created: ${email}`)
