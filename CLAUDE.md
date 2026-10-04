@AGENTS.md

# Training app: instructions for Claude

The owner is a complete beginner with code. Explain what you are doing in plain English, keep steps small, and say
exactly what to click or type whenever the owner needs to do something themselves. Use Australian English. Plain,
direct tone. Never use em dashes in any writing, including code comments and commit messages.

## What this is

A coaching web app for one strength and conditioning coach and about 10 clients. Installable to the phone home
screen, works on desktop. The coach gets a flexible programme builder and a detailed training-load dashboard. The
client side is mobile first and feels like TrainHeroic. Clients only ever see their own data. The data model must
allow more coaches later. The full plan is in README.md under "Decisions on record" and in the first proposal.

Out of scope for now: meal plans, in-app messaging, video feedback, native app store builds, billing, multi-coach
UI, eccentric load view.

## Current state

- Hosted database: Supabase project in Sydney. Migration `db/migrations/0001_people_and_access.sql` is applied.
- `.env.local` exists and is filled in. Do not touch it (see rule 1).
- A coach login exists. The app runs locally at http://localhost:3000 and login works.

## Hard rules

1. **Secrets.** Never open, print, copy, log or commit `.env.local` or any key, password or token. Never ask the
   owner to paste secrets into chat. If a new env var is needed, add its name to `.env.example` with an empty value
   and tell the owner which line to fill in themselves.
2. **Branches and pull requests.** Never push straight to `main`. Create a new branch for every piece of work,
   commit in small steps with clear messages, push the branch, and open a pull request with a plain English summary
   of what changed and how the owner can test it.
3. **Deleting and schema changes.** Ask the owner before deleting any file, table, user or data, and before
   changing the database schema. Schema changes are new numbered migration files in `db/migrations/` (`0002`,
   `0003` and so on), never edits to `0001` or any applied migration. Tell the owner when they need to run one in
   the Supabase SQL Editor, and give the exact steps.
4. **Service role key.** Never put the service role key in client-side code. It is server only
   (`src/lib/supabase/admin.ts`, which imports `server-only`).
5. **Tell first.** Before running any command that installs packages, changes git history or touches the database,
   say what it does and why.
6. **Check your work.** After each change, run the dev server and the type check and lint, fix what breaks, and tell
   the owner what to click through in the browser to confirm it works.

## Tech stack

- Next.js 16 (App Router) with TypeScript and Tailwind CSS. This version differs from older Next.js. Read the
  relevant guide in `node_modules/next/dist/docs/` before writing Next.js code. Route protection lives in
  `src/proxy.ts` (called "proxy" in this version, not "middleware").
- Supabase: Postgres in Sydney, with Supabase Auth. Row level security (RLS) is on every table.
- Zod for validating input. Vitest for tests. GitHub Actions runs lint, type check, tests and build on every push.
- Hosting plan: Vercel with functions in Sydney (`syd1`).

## How to run the app

```
npm install        # first time only
npm run dev        # then open http://localhost:3000
```

Checks to run after every change:

```
npm run lint
npm run typecheck
npm test
npm run build      # before opening a pull request
```

`npm run test:db` starts a throwaway Postgres on this computer and runs the row level security tests. It never
touches the Supabase database.

## How to create a coach login

Run this once per coach. The password must be at least 12 characters.

```
npx tsx --env-file=.env.local scripts/create-coach.mts "Name" email password
```

Clients are not created this way. The coach invites them from the Clients page in the app.

## How the code is laid out

- `src/app/` pages: `/login`, `/coach`, `/coach/clients`, `/today` (client home), `/privacy`, `/offline`.
- `src/lib/auth.ts`: works out who is signed in and their role from the database, never from the browser.
- `src/lib/supabase/`: the three Supabase connections (`server.ts` as the signed-in user, `admin.ts` as the
  service role, `proxy.ts` for session refresh).
- `src/app/coach/exercises/`: exercise library pages (list, add, edit, import) and their server actions.
- `src/app/coach/clients/[id]/`: client profile page (testing numbers, 1RMs) and its server actions.
- `src/lib/clients/`: `testing.ts` (speed conversion, high-speed threshold, form checks, latest 1RM), `queries.ts`.
- `src/lib/exercises/`: `taxonomy.ts` (fixed lists), `suggest.ts` (proposes tags from an exercise name),
  `import.ts` (reads CSV, builds the review table, checks what the coach approves), `queries.ts` (reads).
- `db/migrations/`: numbered SQL files, applied by hand in the Supabase SQL Editor. Applied so far: 0001. Merged but run by
  the owner: 0002, 0003 (ask which have been run).
- `db/tests/`: row level security tests and an import pipeline test.

## Exercise library notes

- Tag lists (regions, movement patterns, joints, joint actions, muscles) have built-in rows with `coach_id` null that
  nobody signed in can change. A coach can add their own rows.
- Exercises are archived, never deleted (no delete permission), because programmes and history will point at them.
- Each exercise's tags use the actual exercise done, so a swapped exercise carries its own tags into load.
- Load attribution: each tagged joint action gets the full load of a set. Muscles use weight 1.0 (primary) and 0.5
  (secondary). Contraction type is stored on `exercise_joint_action` (only concentric is used for load for now).
- Swap suggestions come only from `exercise_swap_option`. Never invent suggestions.
- The importer is one database function, `public.import_exercises`, so an import is all or nothing.
- If a rule in `suggest.ts` uses a tag slug, that slug must be seeded in a migration. A test checks this.

## Client profile notes

- Testing numbers live on `client` (speeds in m/s, shown and typed in km/h). Every change is copied to
  `client_testing_history` by a trigger, so later load calculations can use the numbers that applied at the time.
- 1RMs are append-only rows in `client_exercise_max`. The latest by `measured_on` then `created_at` is the current
  one. There is no edit or delete. Sources: entered, tested, estimated (estimated is for later).
- High-speed running threshold = `hs_threshold_pct` of MAS or of max speed, per `hs_basis`.

## Database rules to keep following

- Every new table gets row level security switched on in the same migration, plus tests in `db/tests/`.
- Use `app.can_access_client(client_id)` in policies so the access rule lives in one place.
- Store prescribed and actual results in separate tables. Never overwrite what the coach prescribed.
- Every owned row must trace back to a coach, so more coaches can be added later.

## How we work

- One feature at a time. Finish and test it before starting the next.
- A new branch for each feature, named for what it does (for example `feature/exercise-library`).
- Small commits with clear messages. Open a pull request when the feature is ready.
- The owner tests in the browser before merging. Do not merge pull requests yourself.
- Do not start building until the owner has said which feature is next.
- Flag anything that needs legal review (health information, privacy law, third-party terms) instead of guessing.
