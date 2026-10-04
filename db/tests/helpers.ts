import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'

const root = join(__dirname, '..')

/** Creates a fresh database, applies the Supabase shim and every migration, returns a superuser client. */
export async function freshDb(baseUrl: string, name: string) {
  const admin = new Client({ connectionString: baseUrl })
  await admin.connect()
  await admin.query(`drop database if exists ${name} with (force)`)
  await admin.query(`create database ${name}`)
  await admin.end()

  const url = new URL(baseUrl)
  url.pathname = `/${name}`
  const db = new Client({ connectionString: url.toString() })
  await db.connect()
  await db.query(readFileSync(join(root, 'tests/supabase_shim.sql'), 'utf8'))
  for (const f of readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    await db.query(readFileSync(join(root, 'migrations', f), 'utf8'))
  }
  return db
}

/** Runs fn as the `authenticated` role with the given user id, as Supabase does for a signed-in request. */
export async function asUser<T>(db: Client, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query('begin')
  try {
    await db.query(`set local role authenticated`)
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ''])
    return await fn()
  } finally {
    await db.query('rollback')
  }
}
