import Link from 'next/link'
import { EXERCISE_KINDS } from '@/lib/exercises/taxonomy'
import { listExercises } from '@/lib/exercises/queries'
import { youtubeId } from '@/lib/exercises/import'

export const metadata = { title: 'Exercises' }

type SearchParams = Promise<{ q?: string; kind?: string; review?: string; archived?: string }>

export default async function ExercisesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const filters = {
    q: sp.q?.trim() || undefined,
    kind: EXERCISE_KINDS.some((k) => k.value === sp.kind) ? sp.kind : undefined,
    review: sp.review === 'needs_review' ? 'needs_review' : undefined,
    archived: sp.archived === '1',
  }
  const exercises = await listExercises(filters)
  const kindLabel = Object.fromEntries(EXERCISE_KINDS.map((k) => [k.value, k.label]))
  const anyFilter = Boolean(filters.q || filters.kind || filters.review || filters.archived)

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Exercises</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/coach/exercises/import" className="rounded border px-3 py-2">Import from a file</Link>
          <Link href="/coach/exercises/new" className="rounded bg-black px-3 py-2 text-white dark:bg-white dark:text-black">Add an exercise</Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="flex flex-col gap-1">
          Search
          <input name="q" defaultValue={filters.q} placeholder="Name" className="rounded border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          Type
          <select name="kind" defaultValue={filters.kind ?? ''} className="rounded border px-3 py-2">
            <option value="">All types</option>
            {EXERCISE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 py-2">
          <input type="checkbox" name="review" value="needs_review" defaultChecked={filters.review === 'needs_review'} />
          Needs review
        </label>
        <label className="flex items-center gap-2 py-2">
          <input type="checkbox" name="archived" value="1" defaultChecked={filters.archived} />
          Archived
        </label>
        <button className="rounded border px-3 py-2">Filter</button>
        {anyFilter && <Link href="/coach/exercises" className="py-2 underline">Clear</Link>}
      </form>

      <p className="text-sm" role="status">
        {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}
        {filters.archived ? ' (archived)' : ''}
      </p>

      {exercises.length === 0 ? (
        <p className="text-sm">
          {anyFilter ? 'Nothing matches those filters.' : 'No exercises yet. Add one, or import your list from a file.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">Name</th>
                <th className="pr-4">Type</th>
                <th className="pr-4">Region</th>
                <th className="pr-4">Pattern</th>
                <th className="pr-4">Tags</th>
                <th>Video</th>
              </tr>
            </thead>
            <tbody>
              {exercises.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="py-2 pr-4">
                    <Link href={`/coach/exercises/${e.id}`} className="underline">{e.name}</Link>
                  </td>
                  <td className="pr-4">{kindLabel[e.kind] ?? e.kind}</td>
                  <td className="pr-4">{e.region ?? ''}</td>
                  <td className="pr-4">{e.pattern ?? ''}</td>
                  <td className="pr-4">{e.review_status === 'needs_review' ? 'Needs review' : 'Reviewed'}</td>
                  <td>
                    {e.video_url ? (
                      <a href={e.video_url} target="_blank" rel="noopener noreferrer" className="underline">
                        {youtubeId(e.video_url) ? 'YouTube' : 'Link'}
                      </a>
                    ) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
