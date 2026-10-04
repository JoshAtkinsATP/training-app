import { describe, expect, it } from 'vitest'
import { ApprovedItemSchema, ApprovedListSchema, buildReview, cleanVideoUrl, nameKey, parseSheetCsv, youtubeId } from './import'

describe('cleanVideoUrl', () => {
  it('takes the link out of a cell with a name stuck in front', () => {
    expect(cleanVideoUrl('Leg Press https://youtu.be/yOg3WiMxVKw')).toBe('https://youtu.be/yOg3WiMxVKw')
  })
  it('handles escaped characters from a sheet export', () => {
    expect(cleanVideoUrl('https://youtube.com/shorts/ZB4\\_m1ABRqY')).toBe('https://youtube.com/shorts/ZB4_m1ABRqY')
  })
  it('keeps a start time on a watch link', () => {
    expect(cleanVideoUrl('https://www.youtube.com/watch?v=4qPJUSczLcM&t=52s')).toContain('v=4qPJUSczLcM')
  })
  it('returns null when there is no web link, or a non-web one', () => {
    expect(cleanVideoUrl('')).toBeNull()
    expect(cleanVideoUrl(undefined)).toBeNull()
    expect(cleanVideoUrl('no link here')).toBeNull()
    expect(cleanVideoUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('youtubeId', () => {
  it.each([
    ['https://youtu.be/oTr8niBLmgI', 'oTr8niBLmgI'],
    ['https://www.youtube.com/watch?v=BeGr3JxzvOk', 'BeGr3JxzvOk'],
    ['https://youtube.com/shorts/jNHIBpdi2Ng', 'jNHIBpdi2Ng'],
    ['https://www.youtube.com/watch?v=4qPJUSczLcM&t=52s', '4qPJUSczLcM'],
  ])('reads %s', (url, id) => expect(youtubeId(url)).toBe(id))
  it('returns null for other sites and junk', () => {
    expect(youtubeId('https://example.com/watch?v=BeGr3JxzvOk')).toBeNull()
    expect(youtubeId('https://youtu.be/short')).toBeNull()
    expect(youtubeId(null)).toBeNull()
  })
})

describe('parseSheetCsv', () => {
  it('reads the header-less TrainHeroic layout', () => {
    const csv = [
      'Back Squat,e,https://youtu.be/oTr8niBLmgI,,"Leg Press,Hack Squat",,Josh',
      'Banded Pogos,e,https://youtube.com/shorts/_R3YZbp-a2A,"Anchor the band.\n\nKeep it rhythmic.",,"Plyometrics,Plyo-Jump",Josh',
      ',e,,,,,Josh',
    ].join('\n')
    const { rows, problems } = parseSheetCsv(csv)
    expect(problems).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: 'Back Squat', similar: ['Leg Press', 'Hack Squat'], videoUrl: 'https://youtu.be/oTr8niBLmgI' })
    expect(rows[1].description).toContain('Keep it rhythmic.')
    expect(rows[1].sourceTags).toEqual(['Plyometrics', 'Plyo-Jump'])
  })

  it('reads a file with a header row, in any column order', () => {
    const { rows } = parseSheetCsv('Video,Exercise,Tags\nhttps://youtu.be/oTr8niBLmgI,Front Squat,"Squat,Legs"\n')
    expect(rows).toEqual([
      expect.objectContaining({ name: 'Front Squat', videoUrl: 'https://youtu.be/oTr8niBLmgI', sourceTags: ['Squat', 'Legs'], rowNumber: 2 }),
    ])
  })

  it('tidies names and strips a byte order mark', () => {
    const { rows } = parseSheetCsv('﻿Name\n  Back   Squat \n')
    expect(rows[0].name).toBe('Back Squat')
  })

  it('reports an empty or oversized file instead of crashing', () => {
    expect(parseSheetCsv('').problems[0]).toMatch(/empty/)
    expect(parseSheetCsv('x'.repeat(2_000_001)).problems[0]).toMatch(/too big/)
    expect(parseSheetCsv(',,\n,,').rows).toEqual([])
  })
})

describe('buildReview', () => {
  const rows = parseSheetCsv(
    ['Back Squat', 'Goal Diet', 'back squat', 'Leg Press', 'Hack Squat'].join('\n'),
  ).rows

  it('unticks non-exercises, repeats and names already in the library', () => {
    const review = buildReview(rows, new Set([nameKey('Leg Press')]))
    expect(review.map((r) => [r.name, r.include, r.note])).toEqual([
      ['Back Squat', true, null],
      ['Goal Diet', false, 'Does not look like an exercise'],
      ['back squat', false, 'Same name as row 1'],
      ['Leg Press', false, 'Already in your library'],
      ['Hack Squat', true, null],
    ])
  })

  it('attaches a tag suggestion to every row', () => {
    const review = buildReview(rows, new Set())
    expect(review[0].suggestion.pattern).toBe('squat')
  })
})

describe('ApprovedListSchema', () => {
  const good = { name: 'Back Squat', kind: 'strength' }

  it('accepts a minimal item and fills in defaults', () => {
    const [item] = ApprovedListSchema.parse([good])
    expect(item).toMatchObject({ equipment: [], is_unilateral: false, review_status: 'needs_review', joint_actions: [], muscles: [], similar: [] })
  })

  it('rejects bad input before it reaches the database', () => {
    expect(() => ApprovedListSchema.parse([])).toThrow(/Tick at least one/)
    expect(() => ApprovedItemSchema.parse({ ...good, kind: 'cardio' })).toThrow()
    expect(() => ApprovedItemSchema.parse({ ...good, name: '   ' })).toThrow()
    expect(() => ApprovedItemSchema.parse({ ...good, video_url: 'javascript:alert(1)' })).toThrow()
    expect(() => ApprovedItemSchema.parse({ ...good, region: 'Lower Body' })).toThrow()
    expect(() => ApprovedItemSchema.parse({ ...good, muscles: [{ slug: 'quadriceps', role: 'boss' }] })).toThrow()
  })
})
