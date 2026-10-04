'use client'

import { useActionState, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { previewImport, runImport, type ImportResult } from '../actions'
import type { ReviewRow } from '@/lib/exercises/import'
import { EXERCISE_KINDS } from '@/lib/exercises/taxonomy'

type Named = { slug: string; name: string }
type Edit = { include: boolean; name: string; kind: string; region: string; pattern: string }

export function ImportFlow({
  regions,
  patterns,
  names,
}: {
  regions: Named[]
  patterns: Named[]
  names: { jointActions: Record<string, string>; muscles: Record<string, string> }
}) {
  const [preview, previewAction, previewing] = useActionState(previewImport, undefined)
  return (
    <div className="flex flex-col gap-6">
      <form action={previewAction} className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          CSV file
          <input type="file" name="file" accept=".csv,text/csv" required className="rounded border px-3 py-2" />
        </label>
        <button disabled={previewing} className="rounded border px-3 py-2 disabled:opacity-50">
          {previewing ? 'Reading...' : 'Read the file'}
        </button>
      </form>
      {preview?.error && <p role="alert" className="text-sm text-red-600">{preview.error}</p>}
      {preview?.rows && (
        // Keyed on the file name so choosing a new file starts a fresh review.
        <Review key={preview.fileName} rows={preview.rows} problems={preview.problems ?? []} regions={regions} patterns={patterns} names={names} />
      )}
    </div>
  )
}

function Review({
  rows,
  problems,
  regions,
  patterns,
  names,
}: {
  rows: ReviewRow[]
  problems: string[]
  regions: Named[]
  patterns: Named[]
  names: { jointActions: Record<string, string>; muscles: Record<string, string> }
}) {
  const [edits, setEdits] = useState<Record<string, Edit>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.id, { include: r.include, name: r.name, kind: r.suggestion.kind, region: r.suggestion.region ?? '', pattern: r.suggestion.pattern ?? '' }]),
    ),
  )
  const [onlyNeedsTags, setOnlyNeedsTags] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [saving, startSaving] = useTransition()

  const update = (id: string, patch: Partial<Edit>) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }))
  const setAll = (include: boolean) => setEdits((e) => Object.fromEntries(Object.entries(e).map(([id, v]) => [id, { ...v, include }])))

  const counts = useMemo(() => {
    const ticked = rows.filter((r) => edits[r.id]?.include)
    return {
      ticked: ticked.length,
      needTags: ticked.filter((r) => r.suggestion.confidence === 'none').length,
      check: ticked.filter((r) => r.suggestion.confidence === 'check').length,
      left: rows.filter((r) => !edits[r.id]?.include).length,
    }
  }, [rows, edits])

  const visible = rows.filter((r) => !onlyNeedsTags || r.suggestion.confidence !== 'good' || !edits[r.id]?.include)

  function save() {
    const items = rows
      .filter((r) => edits[r.id]?.include)
      .map((r) => {
        const e = edits[r.id]
        const s = r.suggestion
        // The suggested joint actions and muscles only fit the suggested region and pattern.
        // If the coach changed either, send none and let them tag it properly after the import.
        const keepsSuggestion = (e.region || null) === s.region && (e.pattern || null) === s.pattern
        return {
          name: e.name,
          kind: e.kind,
          description: r.description,
          video_url: r.videoUrl,
          equipment: s.equipment,
          is_unilateral: s.isUnilateral,
          region: e.region || null,
          pattern: e.pattern || null,
          source_tags: r.sourceTags,
          review_status: 'needs_review' as const,
          joint_actions: keepsSuggestion ? s.jointActions : [],
          muscles: keepsSuggestion ? s.muscles : [],
          similar: r.similar,
        }
      })
    startSaving(async () => setResult(await runImport(items)))
  }

  if (result && !result.error) {
    return (
      <div role="status" className="flex flex-col gap-3 text-sm">
        <p className="text-base font-medium">Import finished.</p>
        <ul className="list-disc pl-5">
          <li>{result.created} exercises added.</li>
          {result.skipped ? <li>{result.skipped} skipped because the name was already in your library.</li> : null}
          <li>{result.swapsAdded} similar-exercise swaps added.{result.swapsUnmatched ? ` ${result.swapsUnmatched} could not be matched to an exercise in your library.` : ''}</li>
        </ul>
        <p>Every imported exercise is marked &quot;Needs review&quot; so you can check its tags.</p>
        <Link href="/coach/exercises?review=needs_review" className="underline">Go to exercises that need review</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {problems.length > 0 && <ul className="list-disc pl-5 text-sm">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}

      <div className="flex flex-wrap items-center gap-4 text-sm" role="status">
        <span>{rows.length} rows read.</span>
        <span><strong>{counts.ticked}</strong> ticked to import, {counts.left} left out.</span>
        {counts.needTags > 0 && <span>{counts.needTags} ticked have no suggested tags yet.</span>}
        {counts.check > 0 && <span>{counts.check} have rough suggestions worth a look.</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={() => setAll(true)} className="rounded border px-3 py-1">Tick all</button>
        <button type="button" onClick={() => setAll(false)} className="rounded border px-3 py-1">Untick all</button>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyNeedsTags} onChange={(e) => setOnlyNeedsTags(e.target.checked)} />
          Show only rows that need a look
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 pr-2">Import</th>
              <th className="pr-2">Name</th>
              <th className="pr-2">Type</th>
              <th className="pr-2">Region</th>
              <th className="pr-2">Pattern</th>
              <th className="pr-2">Suggested tags</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const e = edits[r.id]
              const s = r.suggestion
              const tagText = [
                s.jointActions.map((j) => names.jointActions[j.slug] ?? j.slug).join(', '),
                s.muscles.filter((m) => m.role === 'primary').map((m) => names.muscles[m.slug] ?? m.slug).join(', '),
              ].filter(Boolean).join(' | ')
              return (
                <tr key={r.id} className={`border-b align-top ${e.include ? '' : 'opacity-60'}`}>
                  <td className="py-2 pr-2">
                    <input type="checkbox" checked={e.include} onChange={(ev) => update(r.id, { include: ev.target.checked })} aria-label={`Import ${r.name}`} />
                  </td>
                  <td className="pr-2">
                    <input value={e.name} onChange={(ev) => update(r.id, { name: ev.target.value })} className="w-56 rounded border px-2 py-1" aria-label={`Name for row ${r.rowNumber}`} />
                    {r.note && <div className="mt-1 text-xs">{r.note}</div>}
                    {s.confidence === 'none' && !r.note && <div className="mt-1 text-xs">No tags suggested. Add them after import.</div>}
                    {s.confidence === 'check' && <div className="mt-1 text-xs">Rough suggestion. Worth a look.</div>}
                  </td>
                  <td className="pr-2">
                    <select value={e.kind} onChange={(ev) => update(r.id, { kind: ev.target.value })} className="rounded border px-2 py-1" aria-label={`Type for ${r.name}`}>
                      {EXERCISE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <select value={e.region} onChange={(ev) => update(r.id, { region: ev.target.value })} className="rounded border px-2 py-1" aria-label={`Region for ${r.name}`}>
                      <option value="">Not set</option>
                      {regions.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <select value={e.pattern} onChange={(ev) => update(r.id, { pattern: ev.target.value })} className="rounded border px-2 py-1" aria-label={`Pattern for ${r.name}`}>
                      <option value="">Not set</option>
                      {patterns.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
                    </select>
                  </td>
                  <td className="pr-2 text-xs">{tagText}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button onClick={save} disabled={saving || counts.ticked === 0} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black">
          {saving ? 'Importing...' : `Import ${counts.ticked} ${counts.ticked === 1 ? 'exercise' : 'exercises'}`}
        </button>
        {result?.error && <p role="alert" className="text-sm text-red-600">{result.error}</p>}
      </div>
    </div>
  )
}
