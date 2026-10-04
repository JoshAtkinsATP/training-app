import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getClientProfile, listExerciseNames } from '@/lib/clients/queries'
import { highSpeedThresholdMs, HS_BASES, msToKmh, todayIn } from '@/lib/clients/testing'
import { TestingForm } from './testing-form'
import { MaxForm } from './max-form'

export const metadata = { title: 'Client' }

/** A plain date (YYYY-MM-DD) is shown as is. A timestamp is shown as a date in the client's time zone. */
function date(value: string, timeZone: string) {
  const plainDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: plainDate ? 'UTC' : timeZone,
  }).format(new Date(plainDate ? `${value}T12:00:00Z` : value))
}

const SOURCE_LABEL: Record<string, string> = { entered: 'Entered', tested: 'Tested', estimated: 'Estimated' }

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await getClientProfile(id)
  if (!loaded) notFound()
  const { profile: c, maxRows, historyRows } = loaded
  const exerciseNames = await listExerciseNames()

  const threshold = highSpeedThresholdMs({ basis: c.hs_basis, pct: c.hs_threshold_pct, masMs: c.mas_ms, maxSpeedMs: c.max_speed_ms })
  const basisLabel = HS_BASES.find((b) => b.value === c.hs_basis)?.label ?? c.hs_basis
  const status = !c.active ? 'Inactive' : c.accepted ? 'Active' : 'Invited, not accepted yet'

  return (
    <main className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/coach/clients" className="text-sm underline">Back to clients</Link>
        <h1 className="text-xl font-semibold">{c.name}</h1>
        <p className="text-sm">
          {c.email} · {status} · Time zone {c.time_zone.replace('_', ' ')}
        </p>
        <p className="text-sm">
          {c.consented_at ? `Consent recorded on ${date(c.consented_at, c.time_zone)}.` : 'Consent not recorded yet. The client records it themselves.'}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Testing numbers</h2>
        <p className="text-sm">
          Used for heart rate zones and for working out high-speed running. Every change is kept, so past training is always
          judged against the numbers that applied at the time. Leave a box empty if you do not have the number.
        </p>
        <TestingForm key={`${c.id}-${historyRows.length}`} client={c} />
        <p className="text-sm" role="status">
          {threshold === null
            ? `High-speed running cannot be worked out until you enter this client's ${basisLabel}.`
            : `High-speed running starts at ${threshold} m/s (${msToKmh(threshold)} km/h), which is ${c.hs_threshold_pct}% of ${basisLabel}.`}
        </p>
        {historyRows.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer">History of changes ({historyRows.length})</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className="border-b">
                    <th className="py-1 pr-3">Changed</th><th className="pr-3">Max HR</th><th className="pr-3">Rest HR</th>
                    <th className="pr-3">MAS km/h</th><th className="pr-3">Max speed km/h</th><th className="pr-3">LT HR</th>
                    <th className="pr-3">LT watts</th><th>High speed</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((h) => (
                    <tr key={h.recorded_at} className="border-b">
                      <td className="py-1 pr-3">{date(h.recorded_at, c.time_zone)}</td>
                      <td className="pr-3">{h.hr_max ?? ''}</td>
                      <td className="pr-3">{h.hr_rest ?? ''}</td>
                      <td className="pr-3">{h.mas_ms === null ? '' : msToKmh(h.mas_ms)}</td>
                      <td className="pr-3">{h.max_speed_ms === null ? '' : msToKmh(h.max_speed_ms)}</td>
                      <td className="pr-3">{h.lt_hr ?? ''}</td>
                      <td className="pr-3">{h.lt_power_w ?? ''}</td>
                      <td>{h.hs_threshold_pct}% of {h.hs_basis === 'mas' ? 'MAS' : 'max speed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">1RMs</h2>
        <p className="text-sm">
          The latest entry for each exercise is the current 1RM, and it is what percentage-based prescriptions will use. To
          correct a mistake, add a new entry. Older entries stay as history.
        </p>
        <MaxForm clientId={c.id} exerciseNames={exerciseNames} today={todayIn(c.time_zone)} />
        {maxRows.length === 0 ? (
          <p className="text-sm">No 1RMs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b"><th className="py-2 pr-4">Exercise</th><th className="pr-4">1RM</th><th className="pr-4">Date</th><th className="pr-4">Source</th><th>Earlier</th></tr>
              </thead>
              <tbody>
                {maxRows.map((r) => (
                  <tr key={r.latest.exercise_id} className="border-b align-top">
                    <td className="py-2 pr-4">{r.exerciseName}</td>
                    <td className="pr-4">{r.latest.e1rm_kg} kg</td>
                    <td className="pr-4">{date(r.latest.measured_on, c.time_zone)}</td>
                    <td className="pr-4">{SOURCE_LABEL[r.latest.source] ?? r.latest.source}</td>
                    <td>
                      {r.earlier.length === 0 ? '' : (
                        <details>
                          <summary className="cursor-pointer">{r.earlier.length} earlier</summary>
                          <ul className="mt-1">
                            {r.earlier.map((e) => <li key={e.id}>{e.e1rm_kg} kg on {date(e.measured_on, c.time_zone)}</li>)}
                          </ul>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
