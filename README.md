# Training app

Coaching web app for one strength and conditioning coach and about 10 clients. Installable to the phone home
screen, works on desktop. Australian English throughout.

## Stack

Next.js (App Router, TypeScript), Tailwind, Postgres on Supabase (Sydney, `ap-southeast-2`) with row level
security, Vercel with functions pinned to Sydney (`syd1`), Vitest.

## Decisions on record

- Load attribution: each tagged joint action gets the full volume load of a set. Muscles are weighted (primary 1.0,
  secondary 0.5, editable). Region totals can exceed session totals and are labelled as such.
- Planned = cycle-level target, prescribed = what is written in sessions, achieved = what was logged.
- High-speed running threshold is a percentage of the client's MAS or max speed, set per client (`hs_basis`,
  `hs_threshold_pct`).
- 1RM values are auto-estimated from logged sets as well as entered by the coach.
- A client can flag an injury with no replacement suggested when the coach has not set an injury option. The coach
  is still notified.
- No clients under 18.

## Setup

1. Create a Supabase project in the Sydney region. In Authentication settings, turn off public sign-ups and
   configure SMTP.
2. Copy `.env.example` to `.env.local` and fill it in.
3. Apply `db/migrations/*.sql` in order (SQL editor or `supabase db push`).
4. Create the coach: `npx tsx --env-file=.env.local scripts/create-coach.ts "Name" coach@example.com 'password'`
5. `npm run dev`

## Checks

```
npm run lint
npm run typecheck
npm test            # database tests run only when TEST_DATABASE_URL is set
npm run test:db     # starts a throwaway local Postgres and runs the row level security tests
```

## Access model

Every table has row level security. The helper `app.can_access_client(client_id)` is the rule every later policy
uses: a client may touch their own data, a coach may touch data for their own clients. The service role key is used
only on the server for invites and account linking. Roles come from the database, never from the browser.
