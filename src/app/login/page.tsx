'use client'

import { useActionState, useState } from 'react'
import { sendMagicLink, signInWithPassword } from './actions'

export default function LoginPage() {
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, undefined)
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, undefined)

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      {mode === 'link' ? (
        <form action={linkAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input name="email" type="email" required autoComplete="email" className="rounded border px-3 py-2 text-base" />
          </label>
          <button disabled={linkPending} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black">
            Email me a sign-in link
          </button>
          {linkState?.sent && <p role="status" className="text-sm">If that email has an account, a link is on its way.</p>}
          {linkState?.error && <p role="alert" className="text-sm text-red-600">{linkState.error}</p>}
        </form>
      ) : (
        <form action={pwAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input name="email" type="email" required autoComplete="email" className="rounded border px-3 py-2 text-base" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input name="password" type="password" required autoComplete="current-password" className="rounded border px-3 py-2 text-base" />
          </label>
          <button disabled={pwPending} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black">
            Sign in
          </button>
          {pwState?.error && <p role="alert" className="text-sm text-red-600">{pwState.error}</p>}
        </form>
      )}

      <button type="button" onClick={() => setMode(mode === 'link' ? 'password' : 'link')} className="text-left text-sm underline">
        {mode === 'link' ? 'Coach? Sign in with a password' : 'Use an emailed link instead'}
      </button>
      <p className="text-xs opacity-70">
        Clients are invited by their coach. <a href="/privacy" className="underline">Privacy notice</a>
      </p>
    </main>
  )
}
