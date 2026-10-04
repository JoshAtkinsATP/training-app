import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Me =
  | { role: 'coach'; userId: string; coachId: string; name: string }
  | { role: 'client'; userId: string; clientId: string; name: string }

/** Who is signed in, and in which role. Roles come from the database, never from the client. */
export async function getMe(): Promise<Me | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: coach } = await supabase.from('coach').select('id, name').eq('user_id', user.id).maybeSingle()
  if (coach) return { role: 'coach', userId: user.id, coachId: coach.id, name: coach.name }

  const { data: client } = await supabase.from('client').select('id, name').eq('user_id', user.id).maybeSingle()
  if (client) return { role: 'client', userId: user.id, clientId: client.id, name: client.name }
  return null
}

export async function requireCoach() {
  const me = await getMe()
  if (!me) redirect('/login')
  if (me.role !== 'coach') redirect('/today')
  return me
}

export async function requireClient() {
  const me = await getMe()
  if (!me) redirect('/login')
  if (me.role !== 'client') redirect('/coach')
  return me
}
