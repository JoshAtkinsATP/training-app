'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signInWithPassword(_: { error?: string } | undefined, form: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') ?? '').trim(),
    password: String(form.get('password') ?? ''),
  })
  if (error) return { error: 'Email or password is not right.' }
  redirect('/')
}

export async function sendMagicLink(_: { error?: string; sent?: boolean } | undefined, form: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: String(form.get('email') ?? '').trim(),
    // Never create accounts from the sign-in page. Clients are invited by their coach.
    options: { shouldCreateUser: false, emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  })
  // Same answer whether or not the address exists, so the page does not reveal who has an account.
  if (error && error.status !== 400 && error.status !== 422) return { error: 'Could not send the link. Try again shortly.' }
  return { sent: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
