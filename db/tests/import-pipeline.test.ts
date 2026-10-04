import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { freshDb } from './helpers'
import { ApprovedListSchema, buildReview, parseSheetCsv } from '../../src/lib/exercises/import'

// Runs a spread of exercise names through the same steps the Import page uses (read the CSV,
// propose tags, check the approved list) and then through the real database function.
// If a suggested tag does not exist in the database, or a value breaks a rule, this fails.

const baseUrl = process.env.TEST_DATABASE_URL
const suite = baseUrl ? describe : describe.skip

const NAMES = [
  'Back Squat', 'Bench Press Barbell', 'Pull Up', 'RDL BB', 'Hang Clean', 'Farmers Walk', 'Plank', 'Side Plank', 'Paloff Press Cable',
  'Calf Raise', 'Seated Calf Raise', 'Tib Raise KB', 'Copenhagen', 'Clams Banded', 'Hip Thrust Barbell', 'GHD Nordic', 'Leg Extension',
  'Face Pull', 'Band Ext Rotation', 'Cable Fly Standing', 'Shoulder Press Standing DB', 'Hammer Curl DB', 'Reverse Curl EZ Bar',
  'Wrist Curl Front BB', 'Cable Tricep Extension', 'DB Lateral Raise', 'Front Raise DB', 'Pogos', 'Box Jump', 'MB Lateral Throw',
  'Sprints', 'Assault Bike', 'Stretch Couch Stretch', 'Bird Dog w/ EXT Rotation', 'Deadbugs', 'Russian Twist', 'Sit-up Weighted',
  'Sled Push', 'Thruster', 'Turkish Get Up Sit Up', 'Cossack Squat DB', 'Walking Lunges', 'KB Swing', 'KB Tripple Extension Isometric',
  'Stretch Lats', 'Stretch Mid Trap', 'Stretch Cat Cow', 'Neck Warm up (front)', 'Knee To Wall Test', 'Sit and Reach Test',
  'Seated Y Press Banded', 'Banded Seesaw Press', 'Shoulder Taps', 'Dead Hang', 'Cable Lat Pull Down', 'Seated Cable Row', 'Prone Y Raise',
  'Seated Single Leg Abduction', 'Row Erg', 'Sauna', 'Beep Test - Test', 'Zone 2 Run', 'Pendlay Row', 'Earthquake Bar', 'Bear Crawl',
  'Cable Katana Ext (SA OH Tri Ext)', 'Stretch Hammy', 'Stretch Quads', 'Stretch Calf', 'Stretch Chest', 'Stretch Glutes', 'Squat Jump',
]

suite('import pipeline', () => {
  let db: Client
  const coachUser = '00000000-0000-0000-0000-00000000000a'

  beforeAll(async () => {
    db = await freshDb(baseUrl!, 'import_pipeline')
    await db.query('insert into auth.users (id) values ($1)', [coachUser])
    await db.query(`insert into coach (user_id, name) values ($1, 'A')`, [coachUser])
  })
  afterAll(async () => { await db?.end() })

  const importAsCoach = async (items: unknown) => {
    await db.query('begin')
    try {
      await db.query('set local role authenticated')
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [coachUser])
      const r = (await db.query('select public.import_exercises($1::jsonb) as r', [JSON.stringify(items)])).rows[0].r
      await db.query('commit')
      return r
    } catch (e) {
      await db.query('rollback')
      throw e
    }
  }

  it('reads, proposes, validates and imports a sheet without a single unknown tag', async () => {
    const csv = [
      ...NAMES.map((n, i) => `${n},e,https://youtu.be/abcdefghi${String(i % 10)}${String(i % 7)},,,"Some Tag",Josh`),
      'Goal Diet,e,,,,,Josh',
      'back squat,e,,,,,Josh',
    ].join('\n')
    const { rows, problems } = parseSheetCsv(csv)
    expect(problems).toEqual([])
    const review = buildReview(rows, new Set())
    const ticked = review.filter((r) => r.include)
    expect(ticked).toHaveLength(NAMES.length)
    expect(review.find((r) => r.name === 'Goal Diet')?.include).toBe(false)
    expect(review.find((r) => r.name === 'back squat')?.note).toMatch(/Same name/)

    const items = ApprovedListSchema.parse(
      ticked.map((r) => ({
        name: r.name, kind: r.suggestion.kind, description: r.description, video_url: r.videoUrl,
        equipment: r.suggestion.equipment, is_unilateral: r.suggestion.isUnilateral,
        region: r.suggestion.region, pattern: r.suggestion.pattern, source_tags: r.sourceTags,
        review_status: 'needs_review', joint_actions: r.suggestion.jointActions, muscles: r.suggestion.muscles, similar: r.similar,
      })),
    )
    const result = await importAsCoach(items)
    expect(result).toMatchObject({ created: NAMES.length, skipped: 0 })

    const stored = await db.query(`select count(*)::int as n from exercise where review_status = 'needs_review' and source = 'import'`)
    expect(stored.rows[0].n).toBe(NAMES.length)
    const squat = await db.query(
      `select ja.slug from exercise e join exercise_joint_action x on x.exercise_id = e.id join joint_action ja on ja.id = x.joint_action_id
        where e.name = 'Back Squat' order by 1`)
    expect(squat.rows.map((r) => r.slug)).toEqual(['hip_extension', 'knee_extension'])

    // Importing the same file again changes nothing.
    expect(await importAsCoach(items)).toMatchObject({ created: 0, skipped: NAMES.length })
  })
})
