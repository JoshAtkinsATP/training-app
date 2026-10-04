import { describe, expect, it } from 'vitest'
import { highSpeedThresholdMs, kmhToMs, latestPerExercise, msToKmh, parseMaxForm, parseTestingForm, todayIn, type TestingForm } from './testing'

const blank: TestingForm = { hrMax: '', hrRest: '', masKmh: '', maxSpeedKmh: '', ltHr: '', ltPowerW: '', hsBasis: 'mas', hsPct: '100' }

describe('speed conversion', () => {
  it('converts km/h to m/s and back', () => {
    expect(kmhToMs(18)).toBe(5)
    expect(kmhToMs(17.5)).toBe(4.86)
    expect(msToKmh(5)).toBe(18)
    expect(msToKmh(4.86)).toBe(17.5)
  })
})

describe('highSpeedThresholdMs', () => {
  it('is a percentage of MAS or of max speed', () => {
    expect(highSpeedThresholdMs({ basis: 'mas', pct: 100, masMs: 5, maxSpeedMs: 9 })).toBe(5)
    expect(highSpeedThresholdMs({ basis: 'mas', pct: 120, masMs: 5, maxSpeedMs: 9 })).toBe(6)
    expect(highSpeedThresholdMs({ basis: 'max_speed', pct: 90, masMs: 5, maxSpeedMs: 9 })).toBe(8.1)
  })
  it('is null until the chosen base number is set', () => {
    expect(highSpeedThresholdMs({ basis: 'mas', pct: 100, masMs: null, maxSpeedMs: 9 })).toBeNull()
    expect(highSpeedThresholdMs({ basis: 'max_speed', pct: 100, masMs: 5, maxSpeedMs: null })).toBeNull()
  })
})

describe('parseTestingForm', () => {
  it('accepts a blank form, with a default threshold', () => {
    const r = parseTestingForm(blank)
    expect(r).toEqual({
      ok: true,
      values: { hr_max: null, hr_rest: null, mas_ms: null, max_speed_ms: null, lt_hr: null, lt_power_w: null, hs_basis: 'mas', hs_threshold_pct: 100 },
    })
  })

  it('reads numbers and converts speeds to m/s', () => {
    const r = parseTestingForm({ ...blank, hrMax: '190', hrRest: '52', masKmh: '18', maxSpeedKmh: '32,4', ltHr: '168', ltPowerW: '250', hsBasis: 'max_speed', hsPct: '90' })
    expect(r).toMatchObject({ ok: true, values: { hr_max: 190, hr_rest: 52, mas_ms: 5, max_speed_ms: 9, lt_hr: 168, lt_power_w: 250, hs_basis: 'max_speed', hs_threshold_pct: 90 } })
  })

  it.each([
    [{ hrMax: '300' }, /Max heart rate must be between/],
    [{ hrMax: '19.5' }, /whole number/],
    [{ hrRest: 'abc' }, /must be a number/],
    [{ masKmh: '2' }, /MAS must be between/],
    [{ hsPct: '' }, /percentage/],
    [{ hsPct: '200' }, /High-speed threshold must be between/],
    [{ hsBasis: 'sprint' }, /MAS or max speed/],
    [{ hrMax: '110', hrRest: '110' }, /Resting heart rate must be lower/],
    [{ hrMax: '180', ltHr: '190' }, /cannot be above max/],
    [{ hrRest: '100', ltHr: '90' }, /must be above resting/],
    [{ masKmh: '20', maxSpeedKmh: '18' }, /Max speed cannot be lower than MAS/],
  ])('rejects %j', (patch, message) => {
    const r = parseTestingForm({ ...blank, ...patch })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(message)
  })
})

describe('parseMaxForm', () => {
  const good = { exercise: ' Back  Squat ', kg: '142.5', source: 'tested', measuredOn: '2026-10-01' }
  it('accepts a good entry and tidies the name', () => {
    expect(parseMaxForm(good, '2026-10-04')).toEqual({
      ok: true, values: { exerciseName: 'Back Squat', e1rm_kg: 142.5, source: 'tested', measured_on: '2026-10-01' },
    })
  })
  it('allows today and rejects a future date', () => {
    expect(parseMaxForm({ ...good, measuredOn: '2026-10-04' }, '2026-10-04').ok).toBe(true)
    expect(parseMaxForm({ ...good, measuredOn: '2026-10-05' }, '2026-10-04')).toMatchObject({ ok: false, error: expect.stringMatching(/future/) })
  })
  it.each([
    [{ exercise: '  ' }, /Choose an exercise/],
    [{ kg: '' }, /Enter the 1RM/],
    [{ kg: '0' }, /between 1 and 1000/],
    [{ kg: '1500' }, /between 1 and 1000/],
    [{ source: 'estimated' }, /entered or tested/],
    [{ measuredOn: '04/10/2026' }, /day, month and year/],
  ])('rejects %j', (patch, message) => {
    const r = parseMaxForm({ ...good, ...patch }, '2026-10-04')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(message)
  })
})

describe('latestPerExercise', () => {
  const rec = (id: string, ex: string, kg: number, on: string, at: string) =>
    ({ id, exercise_id: ex, e1rm_kg: kg, source: 'entered', measured_on: on, created_at: at })
  it('picks the latest by date, then by entry time, and keeps the rest as history', () => {
    const out = latestPerExercise([
      rec('a', 'squat', 140, '2026-09-01', '2026-09-01T01:00:00Z'),
      rec('b', 'squat', 150, '2026-10-01', '2026-10-01T01:00:00Z'),
      rec('c', 'squat', 148, '2026-10-01', '2026-10-01T05:00:00Z'),
      rec('d', 'bench', 100, '2026-09-15', '2026-09-15T01:00:00Z'),
    ])
    const squat = out.find((o) => o.latest.exercise_id === 'squat')!
    expect(squat.latest.id).toBe('c')
    expect(squat.earlier.map((r) => r.id)).toEqual(['b', 'a'])
    expect(out.find((o) => o.latest.exercise_id === 'bench')!.earlier).toEqual([])
  })
})

describe('todayIn', () => {
  it("uses the client's own time zone", () => {
    const moment = new Date('2026-10-03T20:00:00Z')
    expect(todayIn('Australia/Sydney', moment)).toBe('2026-10-04')
    expect(todayIn('Australia/Perth', moment)).toBe('2026-10-04')
    expect(todayIn('America/Los_Angeles', moment)).toBe('2026-10-03')
  })
  it('falls back safely for a bad time zone', () => {
    expect(todayIn('Not/AZone', new Date('2026-10-03T20:00:00Z'))).toBe('2026-10-03')
  })
})
