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

- Hosted database: Supabase project in Sydney. Migration `0001_people_and_access.sql` is applied. Migration
  `0002_exercise_library.sql` is merged into the code, and the owner runs it in the Supabase SQL Editor. Ask the
  owner whether it has been run before assuming the exercise pages work.
- `.env.local` exists and is filled in. Do not touch it (see rule 1).
- A coach login exists. The app runs locally at http://localhost:3000 and login works.
- Built so far: sign in, client invites, exercise library (tags, swap lists, CSV import). Not built yet: programmes,
  sessions, logging, training load, check-ins.

## Hard rules

1. **Secrets.** Never open, print, copy, log or commit `.env.local` or any key, password or token. Never ask the
   owner to paste secrets into chat. If a new env var is needed, add its name to `.env.example` with an empty value
   and tell the owner which line to fill in themselves.
2. **Branches and pull requests.** Never push straight to `main`. Create a new branch for every piece of work,
   commit in small steps with clear messages, push the branch, and open a pull request with a plain English summary
   of what changed and how the owner can test it.
3. **Deleting and schema changes.** Ask the owner before deleting any file, table, user or data, and before
   changing the database schema. Schema changes are new numbered migration files in `db/migrations/` (the next number
   after the last one, so `0003` now), never edits to an applied migration. Tell the owner when they need to run one in
   the Supabase SQL Editor, and give the exact steps.
4. **Service role key.** Never put the service role key in client-side code. It is server only
   (`src/lib/supabase/admin.ts`, which imports `server-only`).
5. **Passwords and secrets on websites.** Never type a password, key or token into any website, and never ask the
   owner to paste one into chat. Browser checks are read-only: look, do not click delete, do not enter credentials.
6. **Check your work.** After each change, run the dev server and the type check and lint, fix what breaks, and tell
   the owner what to click through in the browser to confirm it works.
7. **Tell first.** Before running any command that installs packages, changes git history or touches the database,
   say what it does and why.

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
- `src/lib/exercises/`: `taxonomy.ts` (fixed lists), `suggest.ts` (proposes tags from an exercise name),
  `import.ts` (reads CSV, builds the review table, checks what the coach approves), `queries.ts` (reads).
- `db/migrations/`: numbered SQL files, applied by hand in the Supabase SQL Editor. Applied so far: 0001, 0002
  (once the owner has run it).
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

## Database rules to keep following

- Every new table gets row level security switched on in the same migration, plus tests in `db/tests/`.
- Use `app.can_access_client(client_id)` in policies so the access rule lives in one place.
- Store prescribed and actual results in separate tables. Never overwrite what the coach prescribed.
- Every owned row must trace back to a coach, so more coaches can be added later.

## Working agreement

Work on your own and keep the owner out of the loop, except at these checkpoints. At a checkpoint, stop and ask.

- **A migration needs running.** Give the exact file name and say where to paste it (Supabase, SQL Editor, New
  query, paste, Run). Say it is run once only.
- **A new env var needs a real value.** Add the name to `.env.example` with an empty value and say which line to
  fill in.
- **Anything would be deleted, or existing data changed.** Files, tables, users, rows. Ask first.
- **A decision about how the app should work.** Ask one question at a time and give a recommended default.

Everything else, do without asking: branches, commits, pull requests, tests, lint, type check, fixing what breaks.

## How we work

- One feature at a time. Finish and test it before starting the next.
- A new branch for each feature, named for what it does (for example `feature/exercise-library`).
- Small commits with clear messages. Open a pull request when the feature is ready, with a plain English summary
  and how to test it.
- Do not merge pull requests unless the owner asks for that in the same message. Never push to `main`.
- Test it yourself first: run the type check, lint and tests, and start the app. Then tell the owner what to click
  through in the browser. Cloud sessions have no browser tool and no Supabase login, so say clearly what was not
  checked in a real browser.
- Do not start building a new feature until the owner has approved the plan for it.
- Flag anything that needs legal review (health information, privacy law, third-party terms) instead of guessing.
