import { createClient } from '@/lib/supabase/server'

export default async function CoachHome() {
  const supabase = await createClient()
  const { count } = await supabase.from('client').select('id', { count: 'exact', head: true }).eq('active', true)
  return (
    <main>
      <h1 className="text-xl font-semibold">Coach</h1>
      <p className="mt-2 text-sm">{count ?? 0} active clients.</p>
    </main>
  )
}
