import 'server-only'
import { createClient } from '@/lib/supabase/server'

// Reads for the exercise pages. All of these run as the signed-in user, so row level security
// decides what comes back. A coach only ever gets their own library.

export type Option = { id: string; slug: string; name: string }
export type JointGroup = { joint: Option; actions: Option[] }
export type RegionGroup = { region: Option; muscles: Option[] }

export type Taxonomy = {
  regions: Option[]
  patterns: Option[]
  jointGroups: JointGroup[]
  muscleGroups: RegionGroup[]
}

export async function getTaxonomy(): Promise<Taxonomy> {
  const supabase = await createClient()
  const [regions, patterns, joints, actions, muscles] = await Promise.all([
    supabase.from('region').select('id, slug, name').order('position'),
    supabase.from('movement_pattern').select('id, slug, name').order('position'),
    supabase.from('joint').select('id, slug, name, position').order('position'),
    supabase.from('joint_action').select('id, slug, name, joint_id, position').order('position'),
    supabase.from('muscle').select('id, slug, name, region_id, position').order('position'),
  ])
  for (const r of [regions, patterns, joints, actions, muscles]) if (r.error) throw new Error('Could not load the tag lists.')

  return {
    regions: regions.data ?? [],
    patterns: patterns.data ?? [],
    jointGroups: (joints.data ?? []).map((j) => ({
      joint: { id: j.id, slug: j.slug, name: j.name },
      actions: (actions.data ?? []).filter((a) => a.joint_id === j.id).map((a) => ({ id: a.id, slug: a.slug, name: a.name })),
    })),
    muscleGroups: (regions.data ?? []).map((r) => ({
      region: r,
      muscles: (muscles.data ?? []).filter((m) => m.region_id === r.id).map((m) => ({ id: m.id, slug: m.slug, name: m.name })),
    })),
  }
}

export type ExerciseFilters = { q?: string; kind?: string; review?: string; archived?: boolean }

export type ExerciseListItem = {
  id: string
  name: string
  kind: string
  review_status: string
  video_url: string | null
  archived_at: string | null
  region: string | null
  pattern: string | null
}

export async function listExercises(filters: ExerciseFilters): Promise<ExerciseListItem[]> {
  const supabase = await createClient()
  let query = supabase
    .from('exercise')
    .select('id, name, kind, review_status, video_url, archived_at, region:region_id(name), pattern:movement_pattern_id(name)')
    .order('name')
    .limit(2000)
  if (filters.q) query = query.ilike('name', `%${filters.q.replace(/[%_\\]/g, (c) => '\\' + c)}%`)
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.review === 'needs_review') query = query.eq('review_status', 'needs_review')
  query = filters.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)

  const { data, error } = await query
  if (error) throw new Error('Could not load the exercises.')
  return (data ?? []).map((e) => {
    const region = e.region as { name: string } | { name: string }[] | null
    const pattern = e.pattern as { name: string } | { name: string }[] | null
    const first = <T,>(v: T | T[] | null) => (Array.isArray(v) ? (v[0] ?? null) : v)
    return {
      id: e.id,
      name: e.name,
      kind: e.kind,
      review_status: e.review_status,
      video_url: e.video_url,
      archived_at: e.archived_at,
      region: first(region)?.name ?? null,
      pattern: first(pattern)?.name ?? null,
    }
  })
}

export async function existingNameKeys(): Promise<Set<string>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('exercise').select('name_key').limit(5000)
  if (error) throw new Error('Could not load the exercises.')
  return new Set((data ?? []).map((e) => e.name_key as string))
}

export type ExerciseDetail = {
  id: string
  name: string
  kind: string
  description: string | null
  video_url: string | null
  equipment: string[]
  is_unilateral: boolean
  region_id: string | null
  movement_pattern_id: string | null
  review_status: string
  archived_at: string | null
  source_tags: string[]
  /** joint_action_id to contraction type */
  jointActions: Record<string, string>
  /** muscle_id to role */
  muscles: Record<string, string>
  similar: string[]
  /** body_area to exercise names */
  injury: Record<string, string[]>
}

export async function getExercise(id: string): Promise<ExerciseDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = await createClient()
  const { data: ex, error } = await supabase
    .from('exercise')
    .select('id, name, kind, description, video_url, equipment, is_unilateral, region_id, movement_pattern_id, review_status, archived_at, source_tags')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error('Could not load the exercise.')
  if (!ex) return null

  const [ja, mu, swaps] = await Promise.all([
    supabase.from('exercise_joint_action').select('joint_action_id, contraction_type').eq('exercise_id', id),
    supabase.from('exercise_muscle').select('muscle_id, role').eq('exercise_id', id),
    supabase
      .from('exercise_swap_option')
      .select('kind, body_area, position, option_exercise_id')
      .eq('exercise_id', id)
      .order('position'),
  ])
  if (ja.error || mu.error || swaps.error) throw new Error('Could not load the exercise.')

  // Look the swap names up separately rather than joining, so this does not depend on how the
  // API handles the two-column link between a swap row and its exercises.
  const optionIds = [...new Set((swaps.data ?? []).map((s) => s.option_exercise_id as string))]
  const nameById = new Map<string, string>()
  if (optionIds.length) {
    const { data: names, error: namesError } = await supabase.from('exercise').select('id, name').in('id', optionIds)
    if (namesError) throw new Error('Could not load the exercise.')
    for (const n of names ?? []) nameById.set(n.id, n.name)
  }

  const similar: string[] = []
  const injury: Record<string, string[]> = {}
  for (const s of swaps.data ?? []) {
    const name = nameById.get(s.option_exercise_id as string)
    if (!name) continue
    if (s.kind === 'similar') similar.push(name)
    else if (s.body_area) (injury[s.body_area] ??= []).push(name)
  }

  return {
    ...ex,
    equipment: ex.equipment ?? [],
    source_tags: ex.source_tags ?? [],
    jointActions: Object.fromEntries((ja.data ?? []).map((r) => [r.joint_action_id, r.contraction_type])),
    muscles: Object.fromEntries((mu.data ?? []).map((r) => [r.muscle_id, r.role])),
    similar,
    injury,
  }
}
