'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireCoach } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { parseMaxForm, parseTestingForm, todayIn } from '@/lib/clients/testing'

export type FormState = { error?: string; ok?: string } | undefined

const uuid = z.string().uuid()
const text = (form: FormData, key: string) => String(form.get(key) ?? '')

export async function saveTesting(_: FormState, form: FormData): Promise<FormState> {
  await requireCoach()
  const clientId = uuid.safeParse(text(form, 'client_id'))
  if (!clientId.success) return { error: 'Client not found.' }

  const parsed = parseTestingForm({
    hrMax: text(form, 'hr_max'),
    hrRest: text(form, 'hr_rest'),
    masKmh: text(form, 'mas_kmh'),
    maxSpeedKmh: text(form, 'max_speed_kmh'),
    ltHr: text(form, 'lt_hr'),
    ltPowerW: text(form, 'lt_power_w'),
    hsBasis: text(form, 'hs_basis'),
    hsPct: text(form, 'hs_pct'),
  })
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()
  // Row level security only lets a coach update their own clients. If nothing comes back, it was not theirs.
  const { data, error } = await supabase.from('client').update(parsed.values).eq('id', clientId.data).select('id')
  if (error) return { error: 'Could not save the testing numbers.' }
  if (!data || data.length === 0) return { error: 'Client not found.' }

  revalidatePath(`/coach/clients/${clientId.data}`)
  return { ok: 'Saved.' }
}

export async function addMax(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireCoach()
  const clientId = uuid.safeParse(text(form, 'client_id'))
  if (!clientId.success) return { error: 'Client not found.' }

  const supabase = await createClient()
  const { data: client } = await supabase.from('client').select('id, time_zone').eq('id', clientId.data).maybeSingle()
  if (!client) return { error: 'Client not found.' }

  const parsed = parseMaxForm(
    { exercise: text(form, 'exercise'), kg: text(form, 'kg'), source: text(form, 'source'), measuredOn: text(form, 'measured_on') },
    todayIn(client.time_zone),
  )
  if (!parsed.ok) return { error: parsed.error }
  const v = parsed.values

  const { data: exercise, error: findError } = await supabase
    .from('exercise')
    .select('id')
    .eq('name_key', v.exerciseName.toLowerCase())
    .is('archived_at', null)
    .maybeSingle()
  if (findError) return { error: 'Could not check the exercise.' }
  if (!exercise) return { error: `"${v.exerciseName}" is not in your library. Pick a name from the list, or add the exercise first.` }

  const { error } = await supabase.from('client_exercise_max').insert({
    coach_id: me.coachId,
    client_id: clientId.data,
    exercise_id: exercise.id,
    e1rm_kg: v.e1rm_kg,
    source: v.source,
    measured_on: v.measured_on,
  })
  if (error) return { error: 'Could not save the 1RM.' }

  revalidatePath(`/coach/clients/${clientId.data}`)
  return { ok: `Saved ${v.exerciseName}: ${v.e1rm_kg} kg.` }
}
