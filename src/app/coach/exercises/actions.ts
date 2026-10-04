'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireCoach } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { existingNameKeys } from '@/lib/exercises/queries'
import { ApprovedListSchema, buildReview, nameKey, parseSheetCsv, tidyName, type ReviewRow } from '@/lib/exercises/import'
import { BODY_AREAS, CONTRACTIONS, EXERCISE_KINDS, MUSCLE_ROLES, MUSCLE_WEIGHT } from '@/lib/exercises/taxonomy'

export type SaveState = { error?: string; ok?: string } | undefined

const uuid = z.string().uuid()
const KIND_VALUES = EXERCISE_KINDS.map((k) => k.value) as [string, ...string[]]

const ExerciseForm = z.object({
  id: uuid.optional(),
  name: z.string().transform(tidyName).pipe(z.string().min(1, 'Enter a name.').max(200, 'That name is too long.')),
  kind: z.enum(KIND_VALUES, { message: 'Pick a type.' }),
  region: uuid.nullable(),
  pattern: uuid.nullable(),
  isUnilateral: z.boolean(),
  equipment: z.array(z.string().max(40)).max(12),
  videoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'The video link must start with http:// or https://')
    .transform((v) => (v === '' ? null : v)),
  description: z.string().max(5000, 'The notes are too long.').transform((v) => (v.trim() === '' ? null : v.trim())),
  reviewed: z.boolean(),
})

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map(tidyName)
    .filter(Boolean)
}

function pick(form: FormData, prefix: string, allowed: readonly string[]) {
  const out: Record<string, string> = {}
  for (const [key, value] of form.entries()) {
    if (!key.startsWith(prefix)) continue
    const id = key.slice(prefix.length)
    const v = String(value)
    if (v && uuid.safeParse(id).success && allowed.includes(v)) out[id] = v
  }
  return out
}

export async function saveExercise(_: SaveState, form: FormData): Promise<SaveState> {
  const me = await requireCoach()
  const parsed = ExerciseForm.safeParse({
    id: form.get('id') || undefined,
    name: String(form.get('name') ?? ''),
    kind: String(form.get('kind') ?? ''),
    region: form.get('region') ? String(form.get('region')) : null,
    pattern: form.get('pattern') ? String(form.get('pattern')) : null,
    isUnilateral: form.get('is_unilateral') === 'on',
    equipment: String(form.get('equipment') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    videoUrl: String(form.get('video_url') ?? ''),
    description: String(form.get('description') ?? ''),
    reviewed: form.get('reviewed') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const f = parsed.data

  const jointActions = pick(form, 'ja_', CONTRACTIONS)
  const muscles = pick(form, 'mu_', MUSCLE_ROLES)
  const similarNames = lines(form.get('similar'))
  const injuryNames: Record<string, string[]> = {}
  for (const area of BODY_AREAS) {
    const list = lines(form.get(`injury_${area.value}`))
    if (list.length) injuryNames[area.value] = list
  }

  const supabase = await createClient()

  // Work out which exercises the swap lists mean before writing anything.
  const wanted = [...new Set([...similarNames, ...Object.values(injuryNames).flat()].map(nameKey))]
  const idByKey = new Map<string, string>()
  if (wanted.length) {
    const { data, error } = await supabase.from('exercise').select('id, name_key').in('name_key', wanted)
    if (error) return { error: 'Could not check the swap lists. Nothing was saved.' }
    for (const row of data ?? []) idByKey.set(row.name_key, row.id)
  }
  const unknown = wanted.filter((k) => !idByKey.has(k))
  if (unknown.length) {
    return { error: `These swap names are not in your library: ${unknown.join(', ')}. Nothing was saved. Check the spelling or add them first.` }
  }

  const columns = {
    name: f.name,
    kind: f.kind,
    region_id: f.region,
    movement_pattern_id: f.pattern,
    is_unilateral: f.isUnilateral,
    equipment: f.equipment,
    video_url: f.videoUrl,
    description: f.description,
    review_status: f.reviewed ? 'reviewed' : 'needs_review',
  }

  let exerciseId = f.id
  if (exerciseId) {
    const { error } = await supabase.from('exercise').update(columns).eq('id', exerciseId)
    if (error) return { error: error.code === '23505' ? 'You already have an exercise with that name.' : 'Could not save the exercise.' }
  } else {
    const { data, error } = await supabase.from('exercise').insert({ ...columns, coach_id: me.coachId }).select('id').single()
    if (error) return { error: error.code === '23505' ? 'You already have an exercise with that name.' : 'Could not save the exercise.' }
    exerciseId = data.id
  }

  // Tags and swap lists: add what is new first, then remove what is gone, so a failure part way
  // through never leaves an exercise with fewer tags than it started with.
  const tagError = await syncTags(supabase, exerciseId!, jointActions, muscles)
  if (tagError) return { error: tagError }
  const swapError = await syncSwaps(supabase, exerciseId!, me.coachId, similarNames, injuryNames, idByKey)
  if (swapError) return { error: swapError }

  revalidatePath('/coach/exercises')
  if (!f.id) redirect(`/coach/exercises/${exerciseId}?saved=1`)
  revalidatePath(`/coach/exercises/${exerciseId}`)
  return { ok: 'Saved.' }
}

type Db = Awaited<ReturnType<typeof createClient>>

async function syncTags(db: Db, exerciseId: string, jointActions: Record<string, string>, muscles: Record<string, string>) {
  const [haveJa, haveMu] = await Promise.all([
    db.from('exercise_joint_action').select('joint_action_id, contraction_type').eq('exercise_id', exerciseId),
    db.from('exercise_muscle').select('muscle_id, role').eq('exercise_id', exerciseId),
  ])
  if (haveJa.error || haveMu.error) return 'Could not save the tags.'

  const wantJa = Object.entries(jointActions)
  const haveJaKeys = new Set((haveJa.data ?? []).map((r) => `${r.joint_action_id}|${r.contraction_type}`))
  const wantJaKeys = new Set(wantJa.map(([id, c]) => `${id}|${c}`))
  const addJa = wantJa.filter(([id, c]) => !haveJaKeys.has(`${id}|${c}`)).map(([joint_action_id, contraction_type]) => ({ exercise_id: exerciseId, joint_action_id, contraction_type }))
  if (addJa.length) {
    const { error } = await db.from('exercise_joint_action').insert(addJa)
    if (error) return 'Could not save the joint actions.'
  }
  for (const r of haveJa.data ?? []) {
    if (!wantJaKeys.has(`${r.joint_action_id}|${r.contraction_type}`)) {
      const { error } = await db.from('exercise_joint_action').delete().eq('exercise_id', exerciseId).eq('joint_action_id', r.joint_action_id).eq('contraction_type', r.contraction_type)
      if (error) return 'Could not save the joint actions.'
    }
  }

  const haveMuMap = new Map((haveMu.data ?? []).map((r) => [r.muscle_id as string, r.role as string]))
  const upMu = Object.entries(muscles)
    .filter(([id, role]) => haveMuMap.get(id) !== role)
    .map(([muscle_id, role]) => ({ exercise_id: exerciseId, muscle_id, role, weight: MUSCLE_WEIGHT[role as 'primary' | 'secondary'] }))
  if (upMu.length) {
    const { error } = await db.from('exercise_muscle').upsert(upMu, { onConflict: 'exercise_id,muscle_id' })
    if (error) return 'Could not save the muscles.'
  }
  for (const id of haveMuMap.keys()) {
    if (!(id in muscles)) {
      const { error } = await db.from('exercise_muscle').delete().eq('exercise_id', exerciseId).eq('muscle_id', id)
      if (error) return 'Could not save the muscles.'
    }
  }
  return null
}

async function syncSwaps(
  db: Db,
  exerciseId: string,
  coachId: string,
  similar: string[],
  injury: Record<string, string[]>,
  idByKey: Map<string, string>,
) {
  type Want = { kind: 'similar' | 'injury'; body_area: string | null; option: string; position: number }
  const wants: Want[] = []
  similar.forEach((n, i) => wants.push({ kind: 'similar', body_area: null, option: idByKey.get(nameKey(n))!, position: i }))
  for (const [area, names] of Object.entries(injury)) {
    names.forEach((n, i) => wants.push({ kind: 'injury', body_area: area, option: idByKey.get(nameKey(n))!, position: i }))
  }
  const key = (w: { kind: string; body_area: string | null; option: string }) => `${w.kind}|${w.body_area ?? ''}|${w.option}`
  // An exercise cannot be its own swap, and the same swap cannot be listed twice.
  const uniq = new Map<string, Want>()
  for (const w of wants) if (w.option !== exerciseId && !uniq.has(key(w))) uniq.set(key(w), w)

  const { data: have, error } = await db
    .from('exercise_swap_option')
    .select('id, kind, body_area, option_exercise_id')
    .eq('exercise_id', exerciseId)
  if (error) return 'Could not save the swap lists.'
  const haveKeys = new Map((have ?? []).map((r) => [key({ kind: r.kind, body_area: r.body_area, option: r.option_exercise_id }), r.id as string]))

  const add = [...uniq.entries()]
    .filter(([k]) => !haveKeys.has(k))
    .map(([, w]) => ({ coach_id: coachId, exercise_id: exerciseId, option_exercise_id: w.option, kind: w.kind, body_area: w.body_area, position: w.position }))
  if (add.length) {
    const { error: e } = await db.from('exercise_swap_option').insert(add)
    if (e) return 'Could not save the swap lists.'
  }
  const removeIds = [...haveKeys.entries()].filter(([k]) => !uniq.has(k)).map(([, id]) => id)
  if (removeIds.length) {
    const { error: e } = await db.from('exercise_swap_option').delete().in('id', removeIds)
    if (e) return 'Could not save the swap lists.'
  }
  return null
}

export async function setArchived(id: string, archived: boolean) {
  await requireCoach()
  if (!uuid.safeParse(id).success) return
  const supabase = await createClient()
  await supabase.from('exercise').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id)
  revalidatePath('/coach/exercises')
  revalidatePath(`/coach/exercises/${id}`)
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type PreviewState = { error?: string; rows?: ReviewRow[]; problems?: string[]; fileName?: string } | undefined

export async function previewImport(_: PreviewState, form: FormData): Promise<PreviewState> {
  await requireCoach()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a CSV file first.' }
  if (file.size > 2_000_000) return { error: 'That file is too big. Keep it under 2 MB.' }
  const { rows, problems } = parseSheetCsv(await file.text())
  if (rows.length === 0) return { error: problems[0] ?? 'No exercises were found in that file.' }
  const review = buildReview(rows, await existingNameKeys())
  return { rows: review, problems, fileName: file.name }
}

export type ImportResult = { error?: string; created?: number; skipped?: number; swapsAdded?: number; swapsUnmatched?: number }

export async function runImport(items: unknown): Promise<ImportResult> {
  await requireCoach()
  const parsed = ApprovedListSchema.safeParse(items)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('import_exercises', { items: parsed.data })
  if (error) {
    // The database cancels the whole import on any problem, so nothing was saved.
    return { error: `Nothing was imported. ${error.message}` }
  }
  revalidatePath('/coach/exercises')
  const r = data as { created: number; skipped: number; swaps_added: number; swaps_unmatched: number }
  return { created: r.created, skipped: r.skipped, swapsAdded: r.swaps_added, swapsUnmatched: r.swaps_unmatched }
}
