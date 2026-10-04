import { requireClient } from '@/lib/auth'
import { signOut } from '@/app/login/actions'

export default async function Today() {
  const me = await requireClient()
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-semibold">Hi {me.name}</h1>
      <p className="mt-2 text-sm">Your sessions will show here.</p>
      <form action={signOut} className="mt-6"><button className="text-sm underline">Sign out</button></form>
    </main>
  )
}
