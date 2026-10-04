import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { asUser, freshDb } from './helpers'

const baseUrl = process.env.TEST_DATABASE_URL
const suite = baseUrl ? describe : describe.skip

suite('exercise library', () => {
  let db: Client
  const u = {
    coachA: '00000000-0000-0000-0000-00000000000a',
    coachB: '00000000-0000-0000-0000-00000000000b',
    clientA: '00000000-0000-0000-0000-000000000001',
    clientB: '00000000-0000-0000-0000-0000000000b1',
  }
  const id: Record<string, string> = {}

  const slugId = async (table: string, slug: string) =>
    (await db.query(`select id from ${table} where slug = $1 and coach_id is null`, [slug])).rows[0].id as string

  beforeAll(async () => {
    db = await freshDb(baseUrl!, 'rls_exercises')
    for (const v of Object.values(u)) await db.query('insert into auth.users (id) values ($1)', [v])
    id.coachA = (await db.query(`insert into coach (user_id, name) values ($1, 'A') returning id`, [u.coachA])).rows[0].id
    id.coachB = (await db.query(`insert into coach (user_id, name) values ($1, 'B') returning id`, [u.coachB])).rows[0].id
    await db.query(`insert into client (user_id, coach_id, name, email) values ($1, $2, 'CA', 'ca@x.test')`, [u.clientA, id.coachA])
    await db.query(`insert into client (user_id, coach_id, name, email) values ($1, $2, 'CB', 'cb@x.test')`, [u.clientB, id.coachB])
    id.squat = (await db.query(`insert into exercise (coach_id, name) values ($1, 'Back Squat') returning id`, [id.coachA])).rows[0].id
    id.press = (await db.query(`insert into exercise (coach_id, name) values ($1, 'Leg Press') returning id`, [id.coachA])).rows[0].id
    id.bsquatB = (await db.query(`insert into exercise (coach_id, name) values ($1, 'Back Squat') returning id`, [id.coachB])).rows[0].id
  })
  afterAll(async () => { await db?.end() })

  describe('built-in lists', () => {
    it('are seeded', async () => {
      const r = await db.query(`select
        (select count(*) from region where coach_id is null) as regions,
        (select count(*) from joint_action where coach_id is null) as actions,
        (select count(*) from muscle where coach_id is null) as muscles`)
      expect(Number(r.rows[0].regions)).toBe(4)
      expect(Number(r.rows[0].actions)).toBeGreaterThan(25)
      expect(Number(r.rows[0].muscles)).toBeGreaterThan(25)
    })

    it('files knee extension under the knee and quadriceps under the lower body', async () => {
      const r = await db.query(
        `select j.slug as joint, r.slug as region from joint_action ja
           join joint j on j.id = ja.joint_id join region r on r.id = j.region_id where ja.slug = 'knee_extension'`)
      expect(r.rows).toEqual([{ joint: 'knee', region: 'lower_body' }])
      const m = await db.query(`select r.slug from muscle m join region r on r.id = m.region_id where m.slug = 'quadriceps'`)
      expect(m.rows).toEqual([{ slug: 'lower_body' }])
    })

    it('are readable by coaches and clients', async () => {
      for (const uid of [u.coachA, u.clientA, u.clientB]) {
        const rows = await asUser(db, uid, async () => (await db.query('select count(*)::int as n from region')).rows)
        expect(rows[0].n).toBe(4)
      }
    })

    it('cannot be changed or removed by a coach', async () => {
      const upd = await asUser(db, u.coachA, async () => db.query(`update region set name = 'Hacked' where slug = 'lower_body'`))
      expect(upd.rowCount).toBe(0)
      const del = await asUser(db, u.coachA, async () => db.query(`delete from muscle where slug = 'quadriceps'`))
      expect(del.rowCount).toBe(0)
      await expect(asUser(db, u.coachA, async () =>
        db.query(`insert into region (coach_id, slug, name) values (null, 'sneaky', 'Sneaky')`))).rejects.toThrow()
    })

    it("a coach can add their own, and other coaches do not see it", async () => {
      await db.query(`insert into muscle (coach_id, region_id, slug, name) values ($1, $2, 'custom_a', 'Custom A')`,
        [id.coachA, await slugId('region', 'upper_body')])
      const a = await asUser(db, u.coachA, async () => (await db.query(`select slug from muscle where slug = 'custom_a'`)).rows)
      const clientOfA = await asUser(db, u.clientA, async () => (await db.query(`select slug from muscle where slug = 'custom_a'`)).rows)
      const b = await asUser(db, u.coachB, async () => (await db.query(`select slug from muscle where slug = 'custom_a'`)).rows)
      expect(a).toHaveLength(1)
      expect(clientOfA).toHaveLength(1)
      expect(b).toHaveLength(0)
    })
  })

  describe('exercises', () => {
    it("a coach and that coach's client see the library, nobody else does", async () => {
      const names = (uid: string) => asUser(db, uid, async () => (await db.query('select name, coach_id from exercise order by name')).rows)
      expect((await names(u.coachA)).map((r) => r.name)).toEqual(['Back Squat', 'Leg Press'])
      expect((await names(u.clientA)).map((r) => r.name)).toEqual(['Back Squat', 'Leg Press'])
      expect((await names(u.coachB)).map((r) => r.coach_id)).toEqual([id.coachB])
      expect((await names(u.clientB)).map((r) => r.coach_id)).toEqual([id.coachB])
    })

    it('a client cannot add or change exercises', async () => {
      await expect(asUser(db, u.clientA, async () =>
        db.query(`insert into exercise (coach_id, name) values ($1, 'Sneaky')`, [id.coachA]))).rejects.toThrow()
      const upd = await asUser(db, u.clientA, async () => db.query(`update exercise set name = 'Hacked' where id = $1`, [id.squat]))
      expect(upd.rowCount).toBe(0)
    })

    it('a coach cannot add to or change another coach', async () => {
      await expect(asUser(db, u.coachA, async () =>
        db.query(`insert into exercise (coach_id, name) values ($1, 'Sneaky')`, [id.coachB]))).rejects.toThrow()
      const upd = await asUser(db, u.coachA, async () => db.query(`update exercise set name = 'Hacked' where id = $1`, [id.bsquatB]))
      expect(upd.rowCount).toBe(0)
    })

    it('nobody can delete an exercise, because history will point at it', async () => {
      await expect(asUser(db, u.coachA, async () => db.query(`delete from exercise where id = $1`, [id.squat]))).rejects.toThrow()
    })

    it('a coach cannot change who owns an exercise', async () => {
      await expect(asUser(db, u.coachA, async () =>
        db.query(`update exercise set coach_id = $2 where id = $1`, [id.squat, id.coachB]))).rejects.toThrow()
    })

    it('names are unique per coach, ignoring case and spaces, but two coaches may share a name', async () => {
      await expect(asUser(db, u.coachA, async () =>
        db.query(`insert into exercise (coach_id, name) values ($1, '  back SQUAT ')`, [id.coachA]))).rejects.toThrow(/unique/)
    })

    it('rejects a bad kind and a bad video link', async () => {
      await expect(db.query(`insert into exercise (coach_id, name, kind) values ($1, 'X1', 'cardio')`, [id.coachA])).rejects.toThrow()
      await expect(db.query(`insert into exercise (coach_id, name, video_url) values ($1, 'X2', 'javascript:alert(1)')`, [id.coachA])).rejects.toThrow()
    })
  })

  describe('tags', () => {
    it('a coach can tag their exercise, and the tags stay private', async () => {
      // Write as the table owner, then check who can see it.
      await db.query(`insert into exercise_joint_action (exercise_id, joint_action_id) values ($1, $2)`,
        [id.squat, await slugId('joint_action', 'knee_extension')])
      await db.query(`insert into exercise_muscle (exercise_id, muscle_id, role, weight) values ($1, $2, 'primary', 1.0)`,
        [id.squat, await slugId('muscle', 'quadriceps')])
      const own = await asUser(db, u.coachA, async () => (await db.query('select * from exercise_muscle')).rows)
      const other = await asUser(db, u.coachB, async () => (await db.query('select * from exercise_muscle')).rows)
      expect(own).toHaveLength(1)
      expect(other).toHaveLength(0)
    })

    it('contraction type defaults to concentric and only allows known values', async () => {
      const r = await db.query('select contraction_type from exercise_joint_action where exercise_id = $1', [id.squat])
      expect(r.rows).toEqual([{ contraction_type: 'concentric' }])
      await expect(db.query(`insert into exercise_joint_action (exercise_id, joint_action_id, contraction_type) values ($1, $2, 'bouncy')`,
        [id.squat, await slugId('joint_action', 'hip_extension')])).rejects.toThrow()
    })

    it("a coach cannot tag another coach's exercise", async () => {
      await expect(asUser(db, u.coachA, async () =>
        db.query(`insert into exercise_joint_action (exercise_id, joint_action_id) values ($1, $2)`,
          [id.bsquatB, await slugId('joint_action', 'hip_extension')]))).rejects.toThrow()
    })

    it('a client cannot change tags', async () => {
      await expect(asUser(db, u.clientA, async () =>
        db.query(`insert into exercise_muscle (exercise_id, muscle_id, role, weight) values ($1, $2, 'secondary', 0.5)`,
          [id.squat, await slugId('muscle', 'hamstrings')]))).rejects.toThrow()
    })

    it('muscle weight must be above 0 and at most 1', async () => {
      const m = await slugId('muscle', 'hamstrings')
      await expect(db.query(`insert into exercise_muscle values ($1, $2, 'secondary', 0)`, [id.squat, m])).rejects.toThrow()
      await expect(db.query(`insert into exercise_muscle values ($1, $2, 'secondary', 1.5)`, [id.squat, m])).rejects.toThrow()
    })
  })

  describe('swap lists', () => {
    it('a similar swap needs no body area, an injury swap needs one', async () => {
      await db.query(`insert into exercise_swap_option (coach_id, exercise_id, option_exercise_id, kind) values ($1, $2, $3, 'similar')`,
        [id.coachA, id.squat, id.press])
      await expect(db.query(`insert into exercise_swap_option (coach_id, exercise_id, option_exercise_id, kind, body_area)
        values ($1, $2, $3, 'injury', null)`, [id.coachA, id.squat, id.press])).rejects.toThrow()
      await expect(db.query(`insert into exercise_swap_option (coach_id, exercise_id, option_exercise_id, kind, body_area)
        values ($1, $2, $3, 'similar', 'knee')`, [id.coachA, id.squat, id.press])).rejects.toThrow()
      await db.query(`insert into exercise_swap_option (coach_id, exercise_id, option_exercise_id, kind, body_area)
        values ($1, $2, $3, 'injury', 'knee')`, [id.coachA, id.squat, id.press])
    })

    it('rejects an unknown body area, a swap with itself, and a duplicate', async () => {
      await expect(db.query(`insert into exercise_swap_option (coach_id, exercise_id, option_exercise_id, kind, body_area)
        values ($1, $2, $3, 'injury', 'toenail')`, [id.coachA, id.squat, id.press])).rejects.toThrow()
      await expect(db.query(`insert into exercise_swap_option (coach_id, exercise_id, option_exercise_id, kind)
        values ($1, $2, $2, 'similar')`, [id.coachA, id.squat])).rejects.toThrow()
      await expect(db.query(`insert into exercise_swap_option (coach_id, exercise_id, option_exercise_id, kind)
        values ($1, $2, $3, 'similar')`, [id.coachA, id.squat, id.press])).rejects.toThrow(/unique/)
    })

    it("cannot point at another coach's exercise", async () => {
      await expect(db.query(`insert into exercise_swap_option (coach_id, exercise_id, option_exercise_id, kind)
        values ($1, $2, $3, 'similar')`, [id.coachA, id.press, id.bsquatB])).rejects.toThrow(/foreign key/)
    })

    it("a client reads their coach's swap list but cannot change it", async () => {
      const rows = await asUser(db, u.clientA, async () => (await db.query('select kind, body_area from exercise_swap_option order by kind')).rows)
      expect(rows).toEqual([{ kind: 'injury', body_area: 'knee' }, { kind: 'similar', body_area: null }])
      await expect(asUser(db, u.clientA, async () =>
        db.query(`delete from exercise_swap_option`))).resolves.toMatchObject({ rowCount: 0 })
      const other = await asUser(db, u.clientB, async () => (await db.query('select * from exercise_swap_option')).rows)
      expect(other).toEqual([])
    })
  })

  describe('import_exercises', () => {
    const run = (uid: string, items: unknown) =>
      asUser(db, uid, async () => (await db.query('select public.import_exercises($1::jsonb) as r', [JSON.stringify(items)])).rows[0].r)

    // asUser rolls back, so these call the function for real inside their own transaction as the coach.
    const runForReal = async (uid: string, items: unknown) => {
      await db.query('begin')
      try {
        await db.query('set local role authenticated')
        await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
        const r = (await db.query('select public.import_exercises($1::jsonb) as r', [JSON.stringify(items)])).rows[0].r
        await db.query('commit')
        return r
      } catch (e) {
        await db.query('rollback')
        throw e
      }
    }

    it('creates exercises with tags and like-for-like swaps', async () => {
      const result = await runForReal(u.coachA, [
        {
          name: 'Hack Squat', kind: 'strength', region: 'lower_body', pattern: 'squat', equipment: ['machine'],
          video_url: 'https://youtu.be/abc', source_tags: ['Legs'],
          joint_actions: [{ slug: 'knee_extension' }, { slug: 'hip_extension' }],
          muscles: [{ slug: 'quadriceps', role: 'primary' }, { slug: 'gluteus_maximus', role: 'secondary' }],
          similar: ['Leg Press', 'Back Squat', 'Nonexistent Thing'],
        },
      ])
      expect(result).toEqual({ created: 1, skipped: 0, swaps_added: 2, swaps_unmatched: 1 })

      const ex = (await db.query(`select * from exercise where coach_id = $1 and name = 'Hack Squat'`, [id.coachA])).rows[0]
      expect(ex.source).toBe('import')
      expect(ex.review_status).toBe('needs_review')
      expect(ex.equipment).toEqual(['machine'])
      const muscles = await db.query(`select m.slug, em.role, em.weight::float as weight from exercise_muscle em
        join muscle m on m.id = em.muscle_id where em.exercise_id = $1 order by m.slug`, [ex.id])
      expect(muscles.rows).toEqual([
        { slug: 'gluteus_maximus', role: 'secondary', weight: 0.5 },
        { slug: 'quadriceps', role: 'primary', weight: 1 },
      ])
      const actions = await db.query(`select ja.slug from exercise_joint_action e join joint_action ja on ja.id = e.joint_action_id
        where e.exercise_id = $1 order by ja.slug`, [ex.id])
      expect(actions.rows.map((r) => r.slug)).toEqual(['hip_extension', 'knee_extension'])
    })

    it('skips names that already exist and never overwrites or re-adds swaps', async () => {
      const result = await runForReal(u.coachA, [
        { name: 'hack squat', kind: 'mobility', similar: ['Leg Press'] },
        { name: 'Front Squat', region: 'lower_body', pattern: 'squat' },
      ])
      expect(result.created).toBe(1)
      expect(result.skipped).toBe(1)
      const ex = (await db.query(`select kind from exercise where coach_id = $1 and name = 'Hack Squat'`, [id.coachA])).rows[0]
      expect(ex.kind).toBe('strength')
    })

    it('counts the same name twice in one import as one create and one skip', async () => {
      const result = await runForReal(u.coachA, [{ name: 'Twin Move' }, { name: 'TWIN MOVE' }])
      expect(result).toMatchObject({ created: 1, skipped: 1 })
    })

    it('is all or nothing: an unknown tag cancels the whole import', async () => {
      await expect(runForReal(u.coachA, [
        { name: 'Good One', region: 'lower_body' },
        { name: 'Bad One', region: 'moon' },
      ])).rejects.toThrow(/unknown region/)
      const left = await db.query(`select count(*)::int as n from exercise where name in ('Good One', 'Bad One')`)
      expect(left.rows[0].n).toBe(0)
    })

    it('rejects a bad kind and cancels everything', async () => {
      await expect(runForReal(u.coachA, [{ name: 'Fine' }, { name: 'Odd', kind: 'cardio' }])).rejects.toThrow()
      const left = await db.query(`select count(*)::int as n from exercise where name = 'Fine'`)
      expect(left.rows[0].n).toBe(0)
    })

    it('is for coaches only', async () => {
      await expect(run(u.clientA, [{ name: 'Client Import' }])).rejects.toThrow(/only a coach/)
    })

    it('puts rows under the calling coach and never another', async () => {
      await runForReal(u.coachB, [{ name: 'B Only Move' }])
      const rows = await db.query(`select coach_id from exercise where name = 'B Only Move'`)
      expect(rows.rows).toEqual([{ coach_id: id.coachB }])
      const seenByA = await asUser(db, u.coachA, async () => (await db.query(`select * from exercise where name = 'B Only Move'`)).rows)
      expect(seenByA).toEqual([])
    })

    it('refuses a payload that is not a list or is too long', async () => {
      await expect(run(u.coachA, { name: 'x' })).rejects.toThrow(/list/)
      await expect(run(u.coachA, Array.from({ length: 2001 }, (_, i) => ({ name: `n${i}` })))).rejects.toThrow(/2000/)
    })

    it('cannot be called when signed out', async () => {
      await expect(run(null as unknown as string, [{ name: 'x' }])).rejects.toThrow()
    })
  })
})
