'use client'

import { useActionState } from 'react'
import { inviteClient } from './actions'

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteClient, undefined)
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input name="name" required className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input name="email" type="email" required className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Time zone
        <select name="timeZone" defaultValue="Australia/Sydney" className="rounded border px-3 py-2">
          {['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide',
            'Australia/Perth', 'Australia/Darwin', 'Australia/Hobart'].map((z) => <option key={z}>{z}</option>)}
        </select>
      </label>
      <button disabled={pending} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black">
        Send invite
      </button>
      {state?.ok && <p role="status" className="w-full text-sm">{state.ok}</p>}
      {state?.error && <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
