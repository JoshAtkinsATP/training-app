// Testing numbers for a client, and the sums that use them. Speeds are stored in metres per
// second and shown to the coach in km/h, which is how MAS is usually quoted.

export const HS_BASES = [
  { value: 'mas', label: 'MAS' },
  { value: 'max_speed', label: 'Max speed' },
] as const
export type HsBasis = (typeof HS_BASES)[number]['value']

export function kmhToMs(kmh: number): number {
  return Math.round((kmh / 3.6) * 100) / 100
}

export function msToKmh(ms: number): number {
  return Math.round(ms * 3.6 * 10) / 10
}

/** Speed above which running counts as high speed, in m/s. Null if the base number is not set yet. */
export function highSpeedThresholdMs(input: {
  basis: HsBasis
  pct: number
  masMs: number | null
  maxSpeedMs: number | null
}): number | null {
  const base = input.basis === 'mas' ? input.masMs : input.maxSpeedMs
  if (base == null) return null
  return Math.round(base * (input.pct / 100) * 100) / 100
}

/** What goes into the client table. Speeds are in m/s. */
export type TestingValues = {
  hr_max: number | null
  hr_rest: number | null
  mas_ms: number | null
  max_speed_ms: number | null
  lt_hr: number | null
  lt_power_w: number | null
  hs_basis: HsBasis
  hs_threshold_pct: number
}

export type TestingForm = {
  hrMax: string
  hrRest: string
  masKmh: string
  maxSpeedKmh: string
  ltHr: string
  ltPowerW: string
  hsBasis: string
  hsPct: string
}

type Read = { value: number | null } | { error: string }

function readNumber(raw: string, label: string, min: number, max: number, integer: boolean): Read {
  const text = raw.trim().replace(',', '.')
  if (text === '') return { value: null }
  const n = Number(text)
  if (!Number.isFinite(n)) return { error: `${label} must be a number.` }
  if (integer && !Number.isInteger(n)) return { error: `${label} must be a whole number.` }
  if (n < min || n > max) return { error: `${label} must be between ${min} and ${max}.` }
  return { value: n }
}

export type ParsedTesting = { ok: true; values: TestingValues } | { ok: false; error: string }

export function parseTestingForm(f: TestingForm): ParsedTesting {
  const hrMax = readNumber(f.hrMax, 'Max heart rate', 100, 230, true)
  const hrRest = readNumber(f.hrRest, 'Resting heart rate', 25, 120, true)
  const mas = readNumber(f.masKmh, 'MAS', 5, 30, false)
  const maxSpeed = readNumber(f.maxSpeedKmh, 'Max speed', 10, 50, false)
  const ltHr = readNumber(f.ltHr, 'Lactate threshold heart rate', 80, 220, true)
  const ltPower = readNumber(f.ltPowerW, 'Lactate threshold power', 1, 1500, true)
  const pct = readNumber(f.hsPct, 'High-speed threshold', 50, 150, false)

  for (const r of [hrMax, hrRest, mas, maxSpeed, ltHr, ltPower, pct]) {
    if ('error' in r) return { ok: false, error: r.error }
  }
  const v = {
    hrMax: (hrMax as { value: number | null }).value,
    hrRest: (hrRest as { value: number | null }).value,
    mas: (mas as { value: number | null }).value,
    maxSpeed: (maxSpeed as { value: number | null }).value,
    ltHr: (ltHr as { value: number | null }).value,
    ltPower: (ltPower as { value: number | null }).value,
    pct: (pct as { value: number | null }).value,
  }

  if (f.hsBasis !== 'mas' && f.hsBasis !== 'max_speed') return { ok: false, error: 'Pick MAS or max speed for the high-speed threshold.' }
  if (v.pct == null) return { ok: false, error: 'Enter the high-speed threshold as a percentage, for example 100.' }
  if (v.hrMax != null && v.hrRest != null && v.hrRest >= v.hrMax) return { ok: false, error: 'Resting heart rate must be lower than max heart rate.' }
  if (v.ltHr != null && v.hrMax != null && v.ltHr > v.hrMax) return { ok: false, error: 'Lactate threshold heart rate cannot be above max heart rate.' }
  if (v.ltHr != null && v.hrRest != null && v.ltHr <= v.hrRest) return { ok: false, error: 'Lactate threshold heart rate must be above resting heart rate.' }
  if (v.mas != null && v.maxSpeed != null && v.maxSpeed < v.mas) return { ok: false, error: 'Max speed cannot be lower than MAS.' }

  return {
    ok: true,
    values: {
      hr_max: v.hrMax,
      hr_rest: v.hrRest,
      mas_ms: v.mas == null ? null : kmhToMs(v.mas),
      max_speed_ms: v.maxSpeed == null ? null : kmhToMs(v.maxSpeed),
      lt_hr: v.ltHr,
      lt_power_w: v.ltPower,
      hs_basis: f.hsBasis,
      hs_threshold_pct: v.pct,
    },
  }
}

// ---------------------------------------------------------------------------
// 1RM entry
// ---------------------------------------------------------------------------

export type MaxForm = { exercise: string; kg: string; source: string; measuredOn: string }
export type ParsedMax =
  | { ok: true; values: { exerciseName: string; e1rm_kg: number; source: 'entered' | 'tested'; measured_on: string } }
  | { ok: false; error: string }

/** today is a YYYY-MM-DD date in the client's own time zone. A date later than that is rejected. */
export function parseMaxForm(f: MaxForm, today: string): ParsedMax {
  const exerciseName = f.exercise.replace(/\s+/g, ' ').trim()
  if (!exerciseName) return { ok: false, error: 'Choose an exercise from your library.' }
  const kg = readNumber(f.kg, '1RM', 1, 1000, false)
  if ('error' in kg) return { ok: false, error: kg.error }
  if (kg.value == null) return { ok: false, error: 'Enter the 1RM in kilograms.' }
  if (f.source !== 'entered' && f.source !== 'tested') return { ok: false, error: 'Pick entered or tested.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.measuredOn) || Number.isNaN(Date.parse(f.measuredOn))) {
    return { ok: false, error: 'Enter the date as day, month and year.' }
  }
  if (f.measuredOn > today) return { ok: false, error: 'That date is in the future.' }
  return {
    ok: true,
    values: { exerciseName, e1rm_kg: Math.round(kg.value * 100) / 100, source: f.source, measured_on: f.measuredOn },
  }
}

/** Today's date as YYYY-MM-DD in the given time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export type MaxRecord = { id: string; exercise_id: string; e1rm_kg: number; source: string; measured_on: string; created_at: string }

/** The current 1RM per exercise is the latest by date, then by when it was entered. */
export function latestPerExercise<T extends MaxRecord>(records: T[]): { latest: T; earlier: T[] }[] {
  const byExercise = new Map<string, T[]>()
  for (const r of records) byExercise.set(r.exercise_id, [...(byExercise.get(r.exercise_id) ?? []), r])
  return [...byExercise.values()].map((list) => {
    const sorted = [...list].sort((a, b) =>
      a.measured_on === b.measured_on ? b.created_at.localeCompare(a.created_at) : b.measured_on.localeCompare(a.measured_on),
    )
    return { latest: sorted[0], earlier: sorted.slice(1) }
  })
}
