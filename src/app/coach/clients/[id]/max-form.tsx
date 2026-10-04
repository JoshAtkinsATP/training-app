'use client'

import { useActionState, useRef } from 'react'
import { addMax } from './actions'

const field = 'rounded border px-3 py-2'

export function MaxForm({ clientId, exerciseNames, today }: { clientId: string; exerciseNames: string[]; today: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof addMax>[0], form: FormData) => {
    const result = await addMax(prev, form)
    if (result?.ok) formRef.current?.reset()
    return result
  }, undefined)
  const listId = `exercise-names-${clientId}`

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="client_id" value={clientId} />
      <label className="flex flex-col gap-1 text-sm">
        Exercise
        <input name="exercise" list={listId} required autoComplete="off" placeholder="Start typing a name" className={`${field} w-64`} />
        <datalist id={listId}>{exerciseNames.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        1RM (kg)
        <input name="kg" required inputMode="decimal" placeholder="140" className={`${field} w-28`} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Source
        <select name="source" defaultValue="entered" className={field}>
          <option value="entered">Entered by me</option>
          <option value="tested">Tested</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Date
        <input name="measured_on" type="date" required defaultValue={today} max={today} className={field} />
      </label>
      <button disabled={pending} className="rounded border px-4 py-2 text-sm disabled:opacity-50">Add 1RM</button>
      {state?.ok && <p role="status" className="w-full text-sm">{state.ok}</p>}
      {state?.error && <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
