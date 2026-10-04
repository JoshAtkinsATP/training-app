import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { asUser, freshDb } from './helpers'

const baseUrl = process.env.TEST_DATABASE_URL
const suite = baseUrl ? describe : describe.skip

suite('client profiles', () => {
  let db: Client
  const u = {
    coachA: '00000000-0000-0000-0000-00000000000a',
    coachB: '00000000-0000-0000-0000-00000000000b',
    c1: '00000000-0000-0000-0000-000000000001',
    c2: '00000000-0000-0000-0000-000000000002',
    cB: '00000000-0000-0000-0000-0000000000b1',
  }
  const id: Record<string, string> = {}

  // asUser rolls back, so real writes that later tests read are made as the owner or in a committed transaction.
  const commitAs = async (uid: string, sql: string, params: unknown[] = []) => {
    await db.query('begin')
    try {
      await db.query('set local role authenticated')
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
      const r = await db.query(sql, params)
      await db.query('commit')
      return r
    } catch (e) {
      await db.query('rollback')
      throw e
    }
  }

  beforeAll(async () => {
    db = await freshDb(baseUrl!, 'client_profiles')
    for (const v of Object.values(u)) await db.query('insert into auth.users (id) values ($1)', [v])
    id.coachA = (await db.query(`insert into coach (user_id, name) values ($1, 'A') returning id`, [u.coachA])).rows[0].id
    id.coachB = (await db.query(`insert into coach (user_id, name) values ($1, 'B') returning id`, [u.coachB])).rows[0].id
    id.c1 = (await db.query(`insert into client (user_id, coach_id, name, email) values ($1, $2, 'One', 'one@x.test') returning id`, [u.c1, id.coachA])).rows[0].id
    id.c2 = (await db.query(`insert into client (user_id, coach_id, name, email) values ($1, $2, 'Two', 'two@x.test') returning id`, [u.c2, id.coachA])).rows[0].id
    id.cB = (await db.query(`insert into client (user_id, coach_id, name, email) values ($1, $2, 'Bee', 'bee@x.test') returning id`, [u.cB, id.coachB])).rows[0].id
    id.squat = (await db.query(`insert into exercise (coach_id, name) values ($1, 'Back Squat') returning id`, [id.coachA])).rows[0].id
    id.bench = (await db.query(`insert into exercise (coach_id, name) values ($1, 'Bench Press') returning id`, [id.coachA])).rows[0].id
    id.squatB = (await db.query(`insert into exercise (coach_id, name) values ($1, 'Back Squat') returning id`, [id.coachB])).rows[0].id
  })
  afterAll(async () => { await db?.end() })

  describe('1RM records', () => {
    const insertMax = (uid: string, client: string, exercise: string, coach: string, kg: number, extra = '') =>
      commitAs(uid, `insert into client_exercise_max (coach_id, client_id, exercise_id, e1rm_kg ${extra ? ',' + extra.split('=')[0] : ''})
        values ($1, $2, $3, $4 ${extra ? ',' + extra.split('=')[1] : ''})`, [coach, client, exercise, kg])

    it('a coach can add a 1RM for their own client and their own exercise', async () => {
      const r = await insertMax(u.coachA, id.c1, id.squat, id.coachA, 140)
      expect(r.rowCount).toBe(1)
      await insertMax(u.coachA, id.c1, id.squat, id.coachA, 145)
      await insertMax(u.coachA, id.c2, id.bench, id.coachA, 100)
    })

    it('defaults the source to entered and the date to today', async () => {
      const r = await db.query(`select source, measured_on = current_date as today from client_exercise_max where e1rm_kg = 140`)
      expect(r.rows).toEqual([{ source: 'entered', today: true }])
    })

    it("a coach cannot add a 1RM for another coach's client", async () => {
      await expect(insertMax(u.coachA, id.cB, id.squat, id.coachA, 100)).rejects.toThrow(/foreign key/)
    })

    it("a coach cannot use another coach's exercise", async () => {
      await expect(insertMax(u.coachA, id.c1, id.squatB, id.coachA, 100)).rejects.toThrow(/foreign key/)
    })

    it('a coach cannot write a record under another coach', async () => {
      await expect(insertMax(u.coachA, id.cB, id.squatB, id.coachB, 100)).rejects.toThrow()
    })

    it('a client cannot add or change 1RMs', async () => {
      await expect(insertMax(u.c1, id.c1, id.squat, id.coachA, 999)).rejects.toThrow()
      const upd = await asUser(db, u.c1, async () => db.query(`update client_exercise_max set e1rm_kg = 999`))
        .catch((e) => e)
      expect(upd).toBeInstanceOf(Error)
    })

    it('nobody can edit or delete a record, so history is kept', async () => {
      await expect(asUser(db, u.coachA, async () => db.query(`update client_exercise_max set e1rm_kg = 1`))).rejects.toThrow()
      await expect(asUser(db, u.coachA, async () => db.query(`delete from client_exercise_max`))).rejects.toThrow()
    })

    it('a client sees only their own records, and a coach only their own clients', async () => {
      const own = await asUser(db, u.c1, async () => (await db.query('select e1rm_kg::float as kg from client_exercise_max order by kg')).rows)
      expect(own).toEqual([{ kg: 140 }, { kg: 145 }])
      const coachA = await asUser(db, u.coachA, async () => (await db.query('select count(*)::int as n from client_exercise_max')).rows)
      expect(coachA[0].n).toBe(3)
      const coachB = await asUser(db, u.coachB, async () => (await db.query('select count(*)::int as n from client_exercise_max')).rows)
      expect(coachB[0].n).toBe(0)
      const clientB = await asUser(db, u.cB, async () => (await db.query('select count(*)::int as n from client_exercise_max')).rows)
      expect(clientB[0].n).toBe(0)
    })

    it('rejects an impossible weight and an unknown source', async () => {
      await expect(insertMax(u.coachA, id.c1, id.squat, id.coachA, 0)).rejects.toThrow()
      await expect(insertMax(u.coachA, id.c1, id.squat, id.coachA, 1001)).rejects.toThrow()
      await expect(insertMax(u.coachA, id.c1, id.squat, id.coachA, 100, `source='guess'`)).rejects.toThrow()
    })

    it('a coach cannot fake who created the record', async () => {
      await expect(commitAs(u.coachA,
        `insert into client_exercise_max (coach_id, client_id, exercise_id, e1rm_kg, created_by) values ($1, $2, $3, 100, $4)`,
        [id.coachA, id.c1, id.squat, u.coachB])).rejects.toThrow()
    })
  })

  describe('testing history', () => {
    const count = async (client: string) =>
      (await db.query('select count(*)::int as n from client_testing_history where client_id = $1', [client])).rows[0].n as number

    it('does not record a client who has no numbers yet', async () => {
      expect(await count(id.c1)).toBe(0)
    })

    it('records a snapshot when the coach changes testing numbers', async () => {
      await commitAs(u.coachA, `update client set hr_max = 190, mas_ms = 4.8 where id = $1`, [id.c1])
      expect(await count(id.c1)).toBe(1)
      const row = (await db.query('select hr_max, mas_ms::float as mas, hs_basis, recorded_by from client_testing_history where client_id = $1', [id.c1])).rows[0]
      expect(row).toMatchObject({ hr_max: 190, mas: 4.8, hs_basis: 'mas', recorded_by: u.coachA })
    })

    it('records nothing when an update does not change the testing numbers', async () => {
      await commitAs(u.coachA, `update client set hr_max = 190, mas_ms = 4.8 where id = $1`, [id.c1])
      await commitAs(u.c1, `update client set time_zone = 'Australia/Perth' where id = $1`, [id.c1])
      expect(await count(id.c1)).toBe(1)
    })

    it('records another snapshot on the next real change, keeping the old one', async () => {
      await commitAs(u.coachA, `update client set mas_ms = 5.0, hs_threshold_pct = 105 where id = $1`, [id.c1])
      const rows = (await db.query('select mas_ms::float as mas, hs_threshold_pct::float as pct from client_testing_history where client_id = $1 order by id', [id.c1])).rows
      expect(rows).toEqual([{ mas: 4.8, pct: 100 }, { mas: 5, pct: 105 }])
    })

    it('records a new client who is created with numbers', async () => {
      const r = await db.query(`insert into client (coach_id, name, email, hr_max) values ($1, 'Three', 'three@x.test', 185) returning id`, [id.coachA])
      expect(await count(r.rows[0].id)).toBe(1)
    })

    it('is readable by the client and their coach only', async () => {
      const own = await asUser(db, u.c1, async () => (await db.query('select count(*)::int as n from client_testing_history')).rows)
      expect(own[0].n).toBe(2)
      const coach = await asUser(db, u.coachA, async () => (await db.query('select count(*)::int as n from client_testing_history where client_id = $1', [id.c1])).rows)
      expect(coach[0].n).toBe(2)
      const other = await asUser(db, u.coachB, async () => (await db.query('select count(*)::int as n from client_testing_history')).rows)
      expect(other[0].n).toBe(0)
      const otherClient = await asUser(db, u.c2, async () => (await db.query('select count(*)::int as n from client_testing_history where client_id = $1', [id.c1])).rows)
      expect(otherClient[0].n).toBe(0)
    })

    it('cannot be written to or changed by anyone signed in', async () => {
      await expect(asUser(db, u.coachA, async () =>
        db.query(`insert into client_testing_history (client_id, hs_basis, hs_threshold_pct) values ($1, 'mas', 100)`, [id.c1]))).rejects.toThrow()
      await expect(asUser(db, u.coachA, async () => db.query(`update client_testing_history set hr_max = 1`))).rejects.toThrow()
      await expect(asUser(db, u.coachA, async () => db.query(`delete from client_testing_history`))).rejects.toThrow()
    })

    it('a client still cannot change their own testing numbers', async () => {
      await expect(commitAs(u.c1, `update client set mas_ms = 9 where id = $1`, [id.c1])).rejects.toThrow(/clients may only change/)
    })
  })
})
