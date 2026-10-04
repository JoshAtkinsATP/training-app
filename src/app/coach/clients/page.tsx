import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { InviteForm } from './invite-form'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: clients } = await supabase
    .from('client')
    .select('id, name, email, user_id, active')
    .order('name')

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Clients</h1>
      <InviteForm />
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th className="py-2">Name</th><th>Email</th><th>Status</th></tr></thead>
        <tbody>
          {(clients ?? []).map((c) => (
            <tr key={c.id} className="border-b">
              <td className="py-2"><Link href={`/coach/clients/${c.id}`} className="underline">{c.name}</Link></td>
              <td>{c.email}</td>
              <td>{!c.active ? 'Inactive' : c.user_id ? 'Active' : 'Invited'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
