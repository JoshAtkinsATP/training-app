'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireCoach } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const InviteInput = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  timeZone: z.string().min(1).default('Australia/Sydney'),
})

export type InviteState = { error?: string; ok?: string } | undefined

/**
 * The coach is verified server-side first. The privileged writes (client row, invite, login link)
 * then use the service role in one place, so a failed invite can be rolled back cleanly.
 * Re-inviting a client who never accepted reuses their existing record.
 */
export async function inviteClient(_: InviteState, form: FormData): Promise<InviteState> {
  const me = await requireCoach()
  const parsed = InviteInput.safeParse({
    name: form.get('name'),
    email: form.get('email'),
    timeZone: form.get('timeZone') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { name, email, timeZone } = parsed.data

  const supabase = await createClient()
  const { data: existing } = await supabase.from('client').select('id, user_id').eq('email', email).maybeSingle()
  if (existing?.user_id) return { error: 'That email is already one of your clients.' }

  const admin = createAdminClient()
  let clientId = existing?.id
  const createdHere = !clientId
  if (!clientId) {
    const { data: row, error } = await admin
      .from('client')
      .insert({ coach_id: me.coachId, name, email, time_zone: timeZone })
      .select('id')
      .single()
    if (error) return { error: 'Could not add the client.' }
    clientId = row.id
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
  })
  if (inviteError || !invited.user) {
    if (createdHere) await admin.from('client').delete().eq('id', clientId)
    return { error: 'The invite email could not be sent. Check the address and try again.' }
  }
  const { error: linkError } = await admin.from('client').update({ user_id: invited.user.id }).eq('id', clientId)
  if (linkError) return { error: 'The invite was sent but linking the login failed. Try inviting again.' }

  await supabase.from('audit_log').insert({
    actor_user_id: me.userId, client_id: clientId, action: 'invite', entity: 'client', entity_id: clientId,
  })
  revalidatePath('/coach/clients')
  return { ok: `Invite sent to ${email}.` }
}
