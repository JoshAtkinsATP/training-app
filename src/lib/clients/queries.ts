import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { latestPerExercise, type HsBasis, type MaxRecord } from './testing'

// Reads for the client profile page. They run as the signed-in coach, so row level security
// means a coach can only ever load their own clients.

export type ClientProfile = {
  id: string
  name: string
  email: string
  time_zone: string
  active: boolean
  accepted: boolean
  consented_at: string | null
  hr_max: number | null
  hr_rest: number | null
  mas_ms: number | null
  max_speed_ms: number | null
  lt_hr: number | null
  lt_power_w: number | null
  hs_basis: HsBasis
  hs_threshold_pct: number
}

export type MaxRow = { exerciseName: string; latest: MaxRecord; earlier: MaxRecord[] }

export type HistoryRow = {
  recorded_at: string
  hr_max: number | null
  hr_rest: number | null
  mas_ms: number | null
  max_speed_ms: number | null
  lt_hr: number | null
  lt_power_w: number | null
  hs_basis: string
  hs_threshold_pct: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getClientProfile(id: string) {
  if (!UUID.test(id)) return null
  const supabase = await createClient()
  const { data: c, error } = await supabase
    .from('client')
    .select('id, name, email, time_zone, active, user_id, consented_at, hr_max, hr_rest, mas_ms, max_speed_ms, lt_hr, lt_power_w, hs_basis, hs_threshold_pct')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error('Could not load the client.')
  if (!c) return null

  const [maxes, history] = await Promise.all([
    supabase
      .from('client_exercise_max')
      .select('id, exercise_id, e1rm_kg, source, measured_on, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('client_testing_history')
      .select('recorded_at, hr_max, hr_rest, mas_ms, max_speed_ms, lt_hr, lt_power_w, hs_basis, hs_threshold_pct')
      .eq('client_id', id)
      .order('recorded_at', { ascending: false })
      .limit(50),
  ])
  if (maxes.error || history.error) throw new Error('Could not load the client.')

  const records = (maxes.data ?? []).map((r) => ({ ...r, e1rm_kg: Number(r.e1rm_kg) })) as MaxRecord[]
  const exerciseIds = [...new Set(records.map((r) => r.exercise_id))]
  const names = new Map<string, string>()
  if (exerciseIds.length) {
    const { data, error: namesError } = await supabase.from('exercise').select('id, name').in('id', exerciseIds)
    if (namesError) throw new Error('Could not load the client.')
    for (const e of data ?? []) names.set(e.id, e.name)
  }

  const profile: ClientProfile = {
    id: c.id,
    name: c.name,
    email: c.email,
    time_zone: c.time_zone,
    active: c.active,
    accepted: c.user_id !== null,
    consented_at: c.consented_at,
    hr_max: c.hr_max,
    hr_rest: c.hr_rest,
    mas_ms: c.mas_ms === null ? null : Number(c.mas_ms),
    max_speed_ms: c.max_speed_ms === null ? null : Number(c.max_speed_ms),
    lt_hr: c.lt_hr,
    lt_power_w: c.lt_power_w,
    hs_basis: c.hs_basis,
    hs_threshold_pct: Number(c.hs_threshold_pct),
  }

  const maxRows: MaxRow[] = latestPerExercise(records)
    .map((g) => ({ exerciseName: names.get(g.latest.exercise_id) ?? 'Unknown exercise', latest: g.latest, earlier: g.earlier }))
    .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))

  const historyRows: HistoryRow[] = (history.data ?? []).map((h) => ({
    ...h,
    mas_ms: h.mas_ms === null ? null : Number(h.mas_ms),
    max_speed_ms: h.max_speed_ms === null ? null : Number(h.max_speed_ms),
    hs_threshold_pct: Number(h.hs_threshold_pct),
  }))

  return { profile, maxRows, historyRows }
}

/** Names of exercises in the coach's library that are not archived, for the 1RM name box. */
export async function listExerciseNames(): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('exercise').select('name').is('archived_at', null).order('name').limit(2000)
  if (error) throw new Error('Could not load the exercises.')
  return (data ?? []).map((e) => e.name)
}
