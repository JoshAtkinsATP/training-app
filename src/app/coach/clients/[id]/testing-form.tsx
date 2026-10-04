'use client'

import { useActionState } from 'react'
import { saveTesting } from './actions'
import { HS_BASES, msToKmh } from '@/lib/clients/testing'
import type { ClientProfile } from '@/lib/clients/queries'

const field = 'rounded border px-3 py-2'
const kmh = (ms: number | null) => (ms === null ? '' : String(msToKmh(ms)))

export function TestingForm({ client }: { client: ClientProfile }) {
  const [state, action, pending] = useActionState(saveTesting, undefined)
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="client_id" value={client.id} />
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          Max heart rate (beats per minute)
          <input name="hr_max" inputMode="numeric" defaultValue={client.hr_max ?? ''} placeholder="190" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Resting heart rate (beats per minute)
          <input name="hr_rest" inputMode="numeric" defaultValue={client.hr_rest ?? ''} placeholder="55" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Lactate threshold heart rate
          <input name="lt_hr" inputMode="numeric" defaultValue={client.lt_hr ?? ''} placeholder="168" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          MAS (km/h)
          <input name="mas_kmh" inputMode="decimal" defaultValue={kmh(client.mas_ms)} placeholder="18" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Max speed (km/h)
          <input name="max_speed_kmh" inputMode="decimal" defaultValue={kmh(client.max_speed_ms)} placeholder="32" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Lactate threshold power (watts)
          <input name="lt_power_w" inputMode="numeric" defaultValue={client.lt_power_w ?? ''} placeholder="250" className={field} />
        </label>
      </div>

      <fieldset className="rounded border p-3">
        <legend className="px-1 text-sm font-medium">High-speed running starts at</legend>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Percentage
            <input name="hs_pct" inputMode="decimal" defaultValue={client.hs_threshold_pct} className={`${field} w-24`} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            of this client&apos;s
            <select name="hs_basis" defaultValue={client.hs_basis} className={field}>
              {HS_BASES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button disabled={pending} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black">
          Save testing numbers
        </button>
        {state?.ok && <p role="status" className="text-sm">{state.ok}</p>}
        {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  )
}
