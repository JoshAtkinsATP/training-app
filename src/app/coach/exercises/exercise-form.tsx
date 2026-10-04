'use client'

import { useActionState, useTransition } from 'react'
import { saveExercise, setArchived } from './actions'
import { BODY_AREAS, EXERCISE_KINDS } from '@/lib/exercises/taxonomy'
import type { ExerciseDetail, Taxonomy } from '@/lib/exercises/queries'

const CONTRACTION_LABELS = [
  ['concentric', 'Concentric (lifting)'],
  ['isometric', 'Isometric (holding)'],
  ['eccentric', 'Eccentric (lowering)'],
] as const

const field = 'rounded border px-3 py-2'

export function ExerciseForm({ taxonomy, exercise, justCreated }: { taxonomy: Taxonomy; exercise?: ExerciseDetail; justCreated?: boolean }) {
  const [state, action, pending] = useActionState(saveExercise, undefined)
  const [archiving, startArchive] = useTransition()
  const archived = Boolean(exercise?.archived_at)

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-6">
        {exercise && <input type="hidden" name="id" value={exercise.id} />}

        <section className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Name
            <input name="name" required maxLength={200} defaultValue={exercise?.name} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Type
            <select name="kind" defaultValue={exercise?.kind ?? 'strength'} className={field}>
              {EXERCISE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Equipment (separate with commas)
            <input name="equipment" defaultValue={exercise?.equipment.join(', ')} placeholder="barbell, bench" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Body region
            <select name="region" defaultValue={exercise?.region_id ?? ''} className={field}>
              <option value="">Not set</option>
              {taxonomy.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Movement pattern
            <select name="pattern" defaultValue={exercise?.movement_pattern_id ?? ''} className={field}>
              <option value="">Not set</option>
              {taxonomy.patterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_unilateral" defaultChecked={exercise?.is_unilateral} />
            One side at a time (single arm or single leg)
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Video link
            <input name="video_url" type="url" defaultValue={exercise?.video_url ?? ''} placeholder="https://youtu.be/..." className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Coaching notes
            <textarea name="description" rows={4} maxLength={5000} defaultValue={exercise?.description ?? ''} className={field} />
          </label>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Joint actions</h2>
          <p className="text-sm">The movements this exercise trains. Load is counted against each one you pick, in full. Leave the rest as &quot;Not used&quot;.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {taxonomy.jointGroups.map((g) => (
              <fieldset key={g.joint.id} className="rounded border p-3">
                <legend className="px-1 text-sm font-medium">{g.joint.name}</legend>
                <div className="flex flex-col gap-2">
                  {g.actions.map((a) => (
                    <label key={a.id} className="flex items-center justify-between gap-2 text-sm">
                      {a.name}
                      <select name={`ja_${a.id}`} defaultValue={exercise?.jointActions[a.id] ?? ''} className="rounded border px-2 py-1" aria-label={`${a.name} contraction`}>
                        <option value="">Not used</option>
                        {CONTRACTION_LABELS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Muscles</h2>
          <p className="text-sm">Primary muscles count in full. Secondary muscles count for half.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {taxonomy.muscleGroups.map((g) => (
              <fieldset key={g.region.id} className="rounded border p-3">
                <legend className="px-1 text-sm font-medium">{g.region.name}</legend>
                <div className="flex flex-col gap-2">
                  {g.muscles.map((m) => (
                    <label key={m.id} className="flex items-center justify-between gap-2 text-sm">
                      {m.name}
                      <select name={`mu_${m.id}`} defaultValue={exercise?.muscles[m.id] ?? ''} className="rounded border px-2 py-1" aria-label={`${m.name} role`}>
                        <option value="">Not used</option>
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                      </select>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Swap lists</h2>
          <p className="text-sm">
            Clients are only ever offered the exercises you list here. Put one exercise name per line, spelt exactly as it appears in your library.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Similar exercises (a like-for-like swap, for example when equipment is taken)
            <textarea name="similar" rows={3} defaultValue={exercise?.similar.join('\n')} className={field} />
          </label>
          <details className="rounded border p-3" open={Object.keys(exercise?.injury ?? {}).length > 0}>
            <summary className="cursor-pointer text-sm font-medium">Different exercise because of a niggle or injury, by body area</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {BODY_AREAS.map((a) => (
                <label key={a.value} className="flex flex-col gap-1 text-sm">
                  {a.label}
                  <textarea name={`injury_${a.value}`} rows={2} defaultValue={exercise?.injury[a.value]?.join('\n')} className={field} />
                </label>
              ))}
            </div>
          </details>
        </section>

        <section className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="reviewed" defaultChecked={exercise ? exercise.review_status === 'reviewed' : true} />
            I have checked these tags
          </label>
          {exercise && exercise.source_tags.length > 0 && (
            <p className="text-sm">Original tags from the file you imported: {exercise.source_tags.join(', ')}</p>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <button disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black">
            {exercise ? 'Save changes' : 'Add exercise'}
          </button>
          {justCreated && !state && <p role="status" className="text-sm">Exercise added.</p>}
          {state?.ok && <p role="status" className="text-sm">{state.ok}</p>}
          {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        </div>
      </form>

      {exercise && (
        <section className="border-t pt-4 text-sm">
          <p className="mb-2">
            {archived
              ? 'This exercise is archived. It is hidden from the main list and cannot be used in new programmes.'
              : 'Archiving hides this exercise from the main list. Past sessions that used it are not affected. Exercises are never deleted.'}
          </p>
          <button
            type="button"
            disabled={archiving}
            onClick={() => startArchive(() => setArchived(exercise.id, !archived))}
            className="rounded border px-3 py-2 disabled:opacity-50"
          >
            {archived ? 'Restore this exercise' : 'Archive this exercise'}
          </button>
        </section>
      )}
    </div>
  )
}
