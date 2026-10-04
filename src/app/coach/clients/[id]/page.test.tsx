import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Renders the client profile page with sample data, so a display mistake shows up in the tests.
// The data and the server actions are replaced with stand-ins. This is not a browser test.

const profile = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Sam Rivers',
  email: 'sam@example.com',
  time_zone: 'Australia/Sydney',
  active: true,
  accepted: true,
  consented_at: '2026-09-20T01:00:00Z',
  hr_max: 190,
  hr_rest: 52,
  mas_ms: 5,
  max_speed_ms: 9,
  lt_hr: 168,
  lt_power_w: 250,
  hs_basis: 'mas' as const,
  hs_threshold_pct: 100,
}

const state = vi.hoisted(() => ({ result: null as unknown }))

vi.mock('@/lib/clients/queries', () => ({
  getClientProfile: async () => state.result,
  listExerciseNames: async () => ['Back Squat', 'Bench Press'],
}))
vi.mock('./actions', () => ({ saveTesting: async () => undefined, addMax: async () => undefined }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import ClientPage from './page'

const render = async () => renderToStaticMarkup(await ClientPage({ params: Promise.resolve({ id: profile.id }) }))

describe('client profile page', () => {
  it('shows testing numbers, the high-speed threshold, history and 1RMs', async () => {
    state.result = {
      profile,
      historyRows: [
        { recorded_at: '2026-10-01T02:00:00Z', hr_max: 190, hr_rest: 52, mas_ms: 5, max_speed_ms: 9, lt_hr: 168, lt_power_w: 250, hs_basis: 'mas', hs_threshold_pct: 100 },
      ],
      maxRows: [
        {
          exerciseName: 'Back Squat',
          latest: { id: 'a', exercise_id: 'x', e1rm_kg: 142.5, source: 'tested', measured_on: '2026-10-01', created_at: '2026-10-01T01:00:00Z' },
          earlier: [{ id: 'b', exercise_id: 'x', e1rm_kg: 135, source: 'entered', measured_on: '2026-08-01', created_at: '2026-08-01T01:00:00Z' }],
        },
      ],
    }
    const html = await render()
    expect(html).toContain('Sam Rivers')
    expect(html).toContain('sam@example.com')
    expect(html).toContain('Consent recorded on 20 Sept 2026')
    expect(html).toContain('High-speed running starts at 5 m/s (18 km/h), which is 100% of MAS.')
    expect(html).toContain('value="190"')
    expect(html).toContain('value="18"') // MAS shown in km/h
    expect(html).toContain('142.5 kg')
    expect(html).toContain('1 earlier')
    expect(html).toContain('135 kg on 1 Aug 2026')
    expect(html).toContain('History of changes (1)')
    expect(html).toContain('<option value="Back Squat">')
  })

  it('handles a new client with nothing entered', async () => {
    state.result = {
      profile: { ...profile, accepted: false, consented_at: null, hr_max: null, hr_rest: null, mas_ms: null, max_speed_ms: null, lt_hr: null, lt_power_w: null },
      historyRows: [],
      maxRows: [],
    }
    const html = await render()
    expect(html).toContain('Invited, not accepted yet')
    expect(html).toContain('Consent not recorded yet')
    expect(html).toContain("High-speed running cannot be worked out until you enter this client&#x27;s MAS.")
    expect(html).toContain('No 1RMs yet.')
    expect(html).not.toContain('History of changes')
  })

  it('uses max speed in the sentence when that is the chosen base', async () => {
    state.result = { profile: { ...profile, hs_basis: 'max_speed', hs_threshold_pct: 90 }, historyRows: [], maxRows: [] }
    expect(await render()).toContain('High-speed running starts at 8.1 m/s (29.2 km/h), which is 90% of Max speed.')
  })

  it('shows a not found page for a client that is not yours', async () => {
    state.result = null
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
