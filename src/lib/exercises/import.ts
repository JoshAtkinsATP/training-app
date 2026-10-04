import Papa from 'papaparse'
import { z } from 'zod'
import { looksLikeNotAnExercise, suggestTags, type Suggestion } from './suggest'
import { EXERCISE_KINDS } from './taxonomy'

// Reads an exercise list exported as CSV (for example from a Google Sheet) and prepares it
// for review. Nothing is saved here. The coach reviews, then the approved rows go to the
// database in one all-or-nothing call.

const MAX_BYTES = 2_000_000
const MAX_ROWS = 2000

export type SheetRow = {
  rowNumber: number
  name: string
  videoUrl: string | null
  description: string | null
  similar: string[]
  sourceTags: string[]
}

export type ParseResult = { rows: SheetRow[]; problems: string[] }

const HEADER_WORDS = ['name', 'exercise', 'title']

/** Pulls the first web address out of a messy cell, such as "Leg Press https://youtu.be/abc". */
export function cleanVideoUrl(cell: string | undefined): string | null {
  if (!cell) return null
  const match = cell.match(/https?:\/\/[^\s"'<>]+/i)
  if (!match) return null
  const raw = match[0].replace(/[.,;)\]]+$/, '').replace(/\\_/g, '_').replace(/\\&/g, '&')
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

/** The 11 character video id from a YouTube link, or null if it is not a YouTube link. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null
    else if (host === 'youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v')
      else {
        const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/)
        id = m ? m[2] : null
      }
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch {
    return null
  }
}

export function tidyName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

export function nameKey(name: string): string {
  return tidyName(name).toLowerCase()
}

function splitList(cell: string | undefined): string[] {
  return (cell ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Reads CSV text. If the first row looks like a header (it has a column called name, exercise
 * or title) the columns are found by name. Otherwise the layout is the one used by the coach's
 * TrainHeroic export: A name, C video, D description, E substitutes, F tags.
 */
export function parseSheetCsv(text: string): ParseResult {
  const problems: string[] = []
  if (new TextEncoder().encode(text).length > MAX_BYTES) {
    return { rows: [], problems: ['That file is too big. Keep it under 2 MB.'] }
  }
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  const data = parsed.data
  if (data.length === 0) return { rows: [], problems: ['The file is empty.'] }

  const first = data[0].map((c) => c.trim().toLowerCase())
  const hasHeader = first.some((c) => HEADER_WORDS.includes(c))
  const col = { name: 0, video: 2, description: 3, similar: 4, tags: 5 }
  if (hasHeader) {
    const find = (...words: string[]) => first.findIndex((c) => words.some((w) => c === w || c.includes(w)))
    const name = find(...HEADER_WORDS)
    col.name = name
    col.video = find('video', 'link', 'url')
    col.description = find('description', 'cues', 'instructions')
    col.similar = find('substitute', 'similar', 'alternative')
    col.tags = find('tags')
  }
  const body = hasHeader ? data.slice(1) : data
  const offset = hasHeader ? 2 : 1

  if (body.length > MAX_ROWS) {
    problems.push(`The file has ${body.length} rows. Only the first ${MAX_ROWS} are used.`)
  }

  const rows: SheetRow[] = []
  body.slice(0, MAX_ROWS).forEach((cells, i) => {
    const name = tidyName(cells[col.name] ?? '')
    if (!name) return
    rows.push({
      rowNumber: i + offset,
      name,
      videoUrl: col.video >= 0 ? cleanVideoUrl(cells[col.video]) : null,
      description: col.description >= 0 ? (cells[col.description]?.trim() || null) : null,
      similar: col.similar >= 0 ? splitList(cells[col.similar]) : [],
      sourceTags: col.tags >= 0 ? splitList(cells[col.tags]) : [],
    })
  })
  if (rows.length === 0) problems.push('No exercise names were found. The first column should hold the names.')
  return { rows, problems }
}

// ---------------------------------------------------------------------------
// Review rows
// ---------------------------------------------------------------------------

export type ReviewRow = SheetRow & {
  id: string
  suggestion: Suggestion
  /** Whether the row is ticked to import by default. */
  include: boolean
  /** Why a row is unticked or flagged. */
  note: string | null
  /** True when this exact name appeared earlier in the file. */
  duplicateOf: number | null
}

/**
 * Turns parsed rows into review rows: proposes tags, unticks obvious non-exercises, and
 * flags names that appear more than once or already exist in the library.
 */
export function buildReview(rows: SheetRow[], existingNameKeys: Set<string>): ReviewRow[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const key = nameKey(row.name)
    const dupOf = seen.get(key) ?? null
    if (dupOf === null) seen.set(key, row.rowNumber)

    const notExercise = looksLikeNotAnExercise(row.name)
    const exists = existingNameKeys.has(key)
    let include = true
    let note: string | null = null
    if (dupOf !== null) {
      include = false
      note = `Same name as row ${dupOf}`
    } else if (exists) {
      include = false
      note = 'Already in your library'
    } else if (notExercise) {
      include = false
      note = 'Does not look like an exercise'
    }
    return {
      ...row,
      id: `r${row.rowNumber}`,
      suggestion: suggestTags(row.name),
      include,
      note,
      duplicateOf: dupOf,
    }
  })
}

// ---------------------------------------------------------------------------
// What the coach approves, checked again on the server before it reaches the database
// ---------------------------------------------------------------------------

const slug = z.string().regex(/^[a-z0-9_]+$/).max(80)

export const ApprovedItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(EXERCISE_KINDS.map((k) => k.value) as [string, ...string[]]),
  description: z.string().max(5000).nullable().optional(),
  video_url: z.string().url().max(500).regex(/^https?:\/\//i).nullable().optional(),
  equipment: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  is_unilateral: z.boolean().default(false),
  region: slug.nullable().optional(),
  pattern: slug.nullable().optional(),
  source_tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  review_status: z.enum(['needs_review', 'reviewed']).default('needs_review'),
  joint_actions: z.array(z.object({ slug, contraction: z.enum(['concentric', 'eccentric', 'isometric']) })).max(20).default([]),
  muscles: z.array(z.object({ slug, role: z.enum(['primary', 'secondary']) })).max(30).default([]),
  similar: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
})
export type ApprovedItem = z.infer<typeof ApprovedItemSchema>

export const ApprovedListSchema = z.array(ApprovedItemSchema).min(1, 'Tick at least one exercise to import.').max(MAX_ROWS)
