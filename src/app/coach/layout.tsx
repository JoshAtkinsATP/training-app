import Link from 'next/link'
import { requireCoach } from '@/lib/auth'
import { signOut } from '@/app/login/actions'

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const me = await requireCoach()
  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <header className="mb-6 flex items-center justify-between border-b pb-3">
        <nav className="flex gap-4 text-sm">
          <Link href="/coach" className="font-semibold">Coach</Link>
          <Link href="/coach/clients">Clients</Link>
        </nav>
        <form action={signOut} className="flex items-center gap-3 text-sm">
          <span>{me.name}</span>
          <button className="underline">Sign out</button>
        </form>
      </header>
      {children}
    </div>
  )
}
