import { describe, expect, it } from 'vitest'
import { detectEquipment, looksLikeNotAnExercise, suggestTags } from './suggest'

const slugs = (s: { slug: string }[]) => s.map((x) => x.slug)

describe('looksLikeNotAnExercise', () => {
  it.each([
    'Goal Diet', 'Goals Overall', 'Goal Sleep', 'Intro Clip 1 Setting Up Your App', 'Notes', 'Questions', 'Answers',
    'Anything', 'Rest', 'Total Kms', 'arms', 'Push', 'Pull SuperSet', 'Push Main Set', 'Stretch Playlist', 'Warm Up - Anything',
  ])('flags %s', (n) => expect(looksLikeNotAnExercise(n)).toBe(true))

  it.each(['Back Squat', 'Push Up', 'Pull Up', 'Push Press BB', 'Rest Pause Bench', 'Run', 'Goblet Squat'])(
    'keeps %s', (n) => expect(looksLikeNotAnExercise(n)).toBe(false))
})

describe('suggestTags', () => {
  it('tags a back squat', () => {
    const s = suggestTags('Back Squat')
    expect(s).toMatchObject({ kind: 'strength', region: 'lower_body', pattern: 'squat', confidence: 'good', isUnilateral: false })
    expect(slugs(s.jointActions)).toEqual(['knee_extension', 'hip_extension'])
    expect(s.muscles.filter((m) => m.role === 'primary').map((m) => m.slug)).toEqual(['quadriceps', 'gluteus_maximus'])
  })

  it('uses eccentric contraction when the name says so, and isometric for holds', () => {
    expect(suggestTags('Back Squat Eccentric').jointActions.every((j) => j.contraction === 'eccentric')).toBe(true)
    expect(suggestTags('Wall Sit').jointActions.every((j) => j.contraction === 'isometric')).toBe(true)
    expect(suggestTags('Calf Raise Iso Hold').jointActions.every((j) => j.contraction === 'isometric')).toBe(true)
    expect(suggestTags('Back Squat').jointActions.every((j) => j.contraction === 'concentric')).toBe(true)
  })

  it('treats a hamstring curl as an isolation move, not a stretch', () => {
    expect(suggestTags('Prone Hammy Curl')).toMatchObject({ pattern: 'isolation', kind: 'strength' })
    expect(suggestTags('Stretch Hammy')).toMatchObject({ pattern: 'mobility', kind: 'mobility' })
  })

  it('files single leg and split stance work as unilateral', () => {
    expect(suggestTags('Single Leg RDL DB').isUnilateral).toBe(true)
    expect(suggestTags('Bulgarian Split Squat DB')).toMatchObject({ isUnilateral: true, pattern: 'lunge' })
    expect(suggestTags('Back Squat').isUnilateral).toBe(false)
  })

  it('does not mistake a squat jump for a squat', () => {
    expect(suggestTags('Squat Jump')).toMatchObject({ kind: 'plyometric', pattern: 'jump' })
  })

  it('keeps cable katana triceps extensions out of rotation', () => {
    expect(suggestTags('Cable Katana Ext (SA OH Tri Ext)')).toMatchObject({ pattern: 'isolation', region: 'upper_body' })
  })

  it('treats the row erg as conditioning, not a pulling exercise', () => {
    expect(suggestTags('Row Erg')).toMatchObject({ kind: 'conditioning', region: 'whole_body', pattern: null })
    expect(suggestTags('Pendlay Row')).toMatchObject({ pattern: 'pull_horizontal' })
  })

  it('classifies running, tests, recovery and mobility', () => {
    expect(suggestTags('Zone 2 Run')).toMatchObject({ kind: 'conditioning', pattern: 'sprint_run' })
    expect(suggestTags('Beep Test - Test').kind).toBe('test')
    expect(suggestTags('CMJ - Non Testing').kind).toBe('plyometric')
    expect(suggestTags('Sauna').kind).toBe('recovery')
    expect(suggestTags('Stretch Quads').kind).toBe('mobility')
  })

  it('does not call a crab walk conditioning', () => {
    expect(suggestTags('Crab Walk').kind).toBe('strength')
  })

  it('marks approximate matches as "check" and unknown names as "none"', () => {
    expect(suggestTags('MB Lateral Throw').confidence).toBe('check')
    const none = suggestTags('Earthquake Bar')
    expect(none).toMatchObject({ confidence: 'none', region: null, pattern: null, jointActions: [], muscles: [] })
  })

  it('only ever proposes tags that exist in the built-in lists', async () => {
    // Guard against typos in rule slugs: every slug used must be seeded by migration 0002.
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync('db/migrations/0002_exercise_library.sql', 'utf8')
    const names = [
      'Back Squat', 'Bench Press Barbell', 'Pull Up', 'RDL BB', 'Hang Clean', 'Farmers Walk', 'Plank', 'Side Plank', 'Paloff Press Cable',
      'Calf Raise', 'Seated Calf Raise', 'Tib Raise KB', 'Copenhagen', 'Clams Banded', 'Hip Thrust Barbell', 'GHD Nordic', 'Leg Extension',
      'Face Pull', 'Band Ext Rotation', 'Cable Fly Standing', 'Shoulder Press Standing DB', 'Hammer Curl DB', 'Reverse Curl EZ Bar',
      'Wrist Curl Front BB', 'Cable Tricep Extension', 'DB Lateral Raise', 'Front Raise DB', 'Pogos', 'Box Jump', 'MB Lateral Throw',
      'Sprints', 'Assault Bike', 'Stretch Couch Stretch', 'Bird Dog w/ EXT Rotation', 'Deadbugs', 'Russian Twist', 'Sit-up Weighted',
      'Sled Push', 'Thruster', 'Turkish Get Up Sit Up', 'Cossack Squat DB', 'Walking Lunges', 'KB Swing', 'KB Tripple Extension Isometric',
      'Stretch Lats', 'Stretch Mid Trap', 'Stretch Cat Cow', 'Neck Warm up (front)', 'Knee To Wall Test', 'Sit and Reach Test', 'Seated Y Press Banded',
      'Banded Seesaw Press', 'Shoulder Taps', 'Dead Hang', 'Cable Lat Pull Down', 'Seated Cable Row', 'Prone Y Raise', 'Seated Single Leg Abduction',
    ]
    for (const n of names) {
      const s = suggestTags(n)
      const used = [
        ...(s.region ? [`'${s.region}'`] : []),
        ...(s.pattern ? [`'${s.pattern}'`] : []),
        ...s.jointActions.map((j) => `'${j.slug}'`),
        ...s.muscles.map((m) => `'${m.slug}'`),
      ]
      for (const u of used) expect(sql, `${n} uses ${u}`).toContain(u)
    }
  })
})

describe('detectEquipment', () => {
  it('reads the shorthand coaches use', () => {
    expect(detectEquipment('RDL BB')).toEqual(['barbell'])
    expect(detectEquipment('DB Step Up')).toEqual(['dumbbell'])
    expect(detectEquipment('Cable Tricep Extension')).toEqual(['cable'])
    expect(detectEquipment('Banded Face Pull')).toContain('band')
    expect(detectEquipment('Trap Bar Deadlift')).toEqual(['trap bar'])
    expect(detectEquipment('KB Swing')).toEqual(['kettlebell'])
  })
})
