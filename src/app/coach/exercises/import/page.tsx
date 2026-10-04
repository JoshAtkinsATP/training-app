import Link from 'next/link'
import { getTaxonomy } from '@/lib/exercises/queries'
import { ImportFlow } from './import-flow'

export const metadata = { title: 'Import exercises' }

export default async function ImportPage() {
  const taxonomy = await getTaxonomy()
  const names = {
    jointActions: Object.fromEntries(taxonomy.jointGroups.flatMap((g) => g.actions.map((a) => [a.slug, a.name]))),
    muscles: Object.fromEntries(taxonomy.muscleGroups.flatMap((g) => g.muscles.map((m) => [m.slug, m.name]))),
  }
  return (
    <main className="flex flex-col gap-4">
      <Link href="/coach/exercises" className="text-sm underline">Back to exercises</Link>
      <h1 className="text-xl font-semibold">Import exercises from a file</h1>
      <div className="max-w-2xl text-sm leading-6">
        <p>
          Export your list as a CSV file. In Google Sheets, click <strong>File</strong>, then <strong>Download</strong>, then{' '}
          <strong>Comma-separated values (.csv)</strong>. Put the exercise names in the first column. If your file has no header
          row, the app reads it the way a TrainHeroic export is laid out: name, then video link in the third column, coaching
          notes in the fourth, similar exercises in the fifth and tags in the sixth.
        </p>
        <p className="mt-2">
          Nothing is saved until you have reviewed the list and clicked Import. Names already in your library are skipped and
          never overwritten.
        </p>
      </div>
      <ImportFlow
        regions={taxonomy.regions.map((r) => ({ slug: r.slug, name: r.name }))}
        patterns={taxonomy.patterns.map((p) => ({ slug: p.slug, name: p.name }))}
        names={names}
      />
    </main>
  )
}
