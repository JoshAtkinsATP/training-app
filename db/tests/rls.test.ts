import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { asUser, freshDb } from './helpers'

const baseUrl = process.env.TEST_DATABASE_URL
const suite = baseUrl ? describe : describe.skip

suite('people and access', () => {
  let db: Client
  const u = {
    coachA: '00000000-0000-0000-0000-00000000000a',
    coachB: '00000000-0000-0000-0000-00000000000b',
    c1: '00000000-0000-0000-0000-000000000001',
    c2: '00000000-0000-0000-0000-000000000002',
    cB: '00000000-0000-0000-0000-0000000000b1',
  }
  const id: Record<string, string> = {}

  beforeAll(async () => {
    db = await freshDb(baseUrl!, 'rls_people')
    for (const v of Object.values(u)) await db.query('insert into auth.users (id) values ($1)', [v])
    id.coachA = (await db.query(`insert into coach (user_id, name) values ($1, 'Coach A') returning id`, [u.coachA])).rows[0].id
    id.coachB = (await db.query(`insert into coach (user_id, name) values ($1, 'Coach B') returning id`, [u.coachB])).rows[0].id
    id.c1 = (await db.query(`insert into client (user_id, coach_id, name, email) values ($1, $2, 'One', 'one@x.test') returning id`, [u.c1, id.coachA])).rows[0].id
    id.c2 = (await db.query(`insert into client (user_id, coach_id, name, email) values ($1, $2, 'Two', 'two@x.test') returning id`, [u.c2, id.coachA])).rows[0].id
    id.cB = (await db.query(`insert into client (user_id, coach_id, name, email) values ($1, $2, 'Bee', 'bee@x.test') returning id`, [u.cB, id.coachB])).rows[0].id
  })
  afterAll(async () => { await db?.end() })

  it('a client sees only their own row', async () => {
    const rows = await asUser(db, u.c1, async () => (await db.query('select name from client')).rows)
    expect(rows).toEqual([{ name: 'One' }])
  })

  it('a coach sees only their own clients', async () => {
    const rows = await asUser(db, u.coachA, async () => (await db.query('select name from client order by name')).rows)
    expect(rows.map((r) => r.name)).toEqual(['One', 'Two'])
  })

  it('a coach cannot see another coach', async () => {
    const rows = await asUser(db, u.coachA, async () => (await db.query('select name from coach')).rows)
    expect(rows).toEqual([{ name: 'Coach A' }])
  })

  it('an unauthenticated caller sees nothing', async () => {
    const rows = await asUser(db, null, async () => (await db.query('select * from client')).rows)
    expect(rows).toEqual([])
  })

  it('a client can change their name and time zone', async () => {
    const res = await asUser(db, u.c1, async () =>
      db.query(`update client set name = 'Uno', time_zone = 'Australia/Perth' where id = $1 returning name`, [id.c1]))
    expect(res.rows).toEqual([{ name: 'Uno' }])
  })

  it("a client cannot change another client's row", async () => {
    const res = await asUser(db, u.c1, async () => db.query(`update client set name = 'Hacked' where id = $1`, [id.c2]))
    expect(res.rowCount).toBe(0)
  })

  it('a client cannot change coach-managed fields', async () => {
    await expect(asUser(db, u.c1, async () =>
      db.query(`update client set mas_ms = 5 where id = $1`, [id.c1]))).rejects.toThrow(/clients may only change/)
    await expect(asUser(db, u.c1, async () =>
      db.query(`update client set coach_id = $2 where id = $1`, [id.c1, id.coachB]))).rejects.toThrow()
  })

  it('a client can record consent once but not alter it', async () => {
    await expect(asUser(db, u.c1, async () => {
      await db.query(`update client set consented_at = now() where id = $1`, [id.c1])
      await db.query(`update client set consented_at = now() + interval '1 day' where id = $1`, [id.c1])
    })).rejects.toThrow(/already recorded/)
  })

  it('a coach cannot record consent for a client', async () => {
    await expect(asUser(db, u.coachA, async () =>
      db.query(`update client set consented_at = now() where id = $1`, [id.c1]))).rejects.toThrow(/only the client/)
  })

  it('a coach can update their own client but not another coach\'s', async () => {
    const own = await asUser(db, u.coachA, async () => db.query(`update client set mas_ms = 4.5 where id = $1`, [id.c1]))
    expect(own.rowCount).toBe(1)
    const other = await asUser(db, u.coachA, async () => db.query(`update client set mas_ms = 4.5 where id = $1`, [id.cB]))
    expect(other.rowCount).toBe(0)
  })

  it('a coach cannot move a client to another coach', async () => {
    await expect(asUser(db, u.coachA, async () =>
      db.query(`update client set coach_id = $2 where id = $1`, [id.c1, id.coachB]))).rejects.toThrow()
  })

  it('a coach cannot create a client under another coach', async () => {
    await expect(asUser(db, u.coachA, async () =>
      db.query(`insert into client (coach_id, name, email) values ($1, 'X', 'x@x.test')`, [id.coachB]))).rejects.toThrow()
  })

  it('can_access_client matches the role rules', async () => {
    const q = (uid: string, target: string) =>
      asUser(db, uid, async () => (await db.query('select app.can_access_client($1) as ok', [target])).rows[0].ok)
    expect(await q(u.coachA, id.c1)).toBe(true)
    expect(await q(u.c1, id.c1)).toBe(true)
    expect(await q(u.c1, id.c2)).toBe(false)
    expect(await q(u.coachB, id.c1)).toBe(false)
  })

  it('deactivated clients lose access', async () => {
    await db.query('update client set active = false where id = $1', [id.c2])
    const rows = await asUser(db, u.c2, async () => (await db.query('select * from client')).rows)
    expect(rows).toEqual([])
    await db.query('update client set active = true where id = $1', [id.c2])
  })

  it('audit rows are append-only and scoped', async () => {
    await asUser(db, u.coachA, async () => {
      await db.query(`insert into audit_log (actor_user_id, client_id, action, entity) values ($1, $2, 'read', 'client')`, [u.coachA, id.c1])
    }).catch(() => {})
    // Insert for real (asUser rolls back), then check visibility and immutability.
    await db.query(`insert into audit_log (actor_user_id, client_id, action, entity) values ($1, $2, 'read', 'client')`, [u.coachA, id.c1])
    const seenByA = await asUser(db, u.coachA, async () => (await db.query('select coach_id from audit_log')).rows)
    expect(seenByA).toEqual([{ coach_id: id.coachA }])
    const seenByB = await asUser(db, u.coachB, async () => (await db.query('select * from audit_log')).rows)
    expect(seenByB).toEqual([])
    const seenByClient = await asUser(db, u.c1, async () => (await db.query('select * from audit_log')).rows)
    expect(seenByClient).toEqual([])
    await expect(asUser(db, u.coachA, async () => db.query('delete from audit_log'))).rejects.toThrow()
    await expect(asUser(db, u.coachA, async () => db.query(`update audit_log set action = 'x'`))).rejects.toThrow()
  })

  it("audit insert is refused for a client the caller cannot access", async () => {
    await expect(asUser(db, u.coachA, async () =>
      db.query(`insert into audit_log (actor_user_id, client_id, action, entity) values ($1, $2, 'read', 'client')`, [u.coachA, id.cB]))).rejects.toThrow()
  })
})
