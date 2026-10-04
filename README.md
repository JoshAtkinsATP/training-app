# Training app

A coaching web app for one strength and conditioning coach and about 10 clients. Clients can add it to their phone
home screen. It also works on a desktop browser. It uses Australian English throughout.

This file explains how to set it up from scratch. You do not need to know how to code. Steps marked **You do this**
need you to click or type something. Everything else is explained so you know what is going on.

## What it is built with (plain English)

- **Next.js**: the framework that builds the pages you see in the browser.
- **Supabase**: the online database and login system. Ours lives in Sydney, so health data stays in Australia.
- **GitHub**: where the code is stored and checked.
- **Vercel** (later): where the finished app will be put online.

## One-time setup from scratch

### 1. Install the tools on your computer

**You do this.**

1. Install **Node.js** version 22 or newer from nodejs.org (choose the "LTS" download).
2. Install **Git** from git-scm.com.
3. Download the project: open a terminal (on Windows, "Git Bash"; on Mac, "Terminal") and type:

   ```
   git clone https://github.com/JoshAtkinsATP/training-app.git
   cd training-app
   ```

4. Install the project's building blocks (this downloads other people's code that the app relies on):

   ```
   npm install
   ```

### 2. Create the database

**You do this.**

1. Go to supabase.com, sign in, and click **New project**.
2. Pick the region **Australia (Sydney)**. This matters for privacy. It cannot be changed later.
3. Choose a strong database password and keep it in your password manager. You will not need it for the app.

### 3. Lock down sign-ups

**You do this.** Clients are invited by the coach, so nobody should be able to create their own account.

1. In Supabase, click **Authentication** in the left menu.
2. Find the sign-in settings (named **Sign In / Providers** or **Providers**, depending on the dashboard version).
3. Turn **off** the option that allows new users to sign up.

### 4. Tell Supabase where the app lives

**You do this.** Without this, the links in invite emails will not work.

1. In Supabase, go to **Authentication**, then **URL Configuration**.
2. Set **Site URL** to `http://localhost:3000` (you will change this to the real web address later).
3. Under **Redirect URLs**, add `http://localhost:3000/auth/callback`.

### 5. Build the database tables

**You do this.** The tables are described in files inside the `db/migrations` folder. Run them in number order,
one at a time:

1. `0001_people_and_access.sql` (people and privacy rules)
2. `0002_exercise_library.sql` (exercises, tags and swap lists)
3. `0003_client_profiles.sql` (1RMs and the history of testing numbers)

For each file:

1. In Supabase, click **SQL Editor** in the left menu, then **New query**.
2. Open the file on your computer, copy everything in it, and paste it into the query box.
3. Click **Run**. You should see "Success. No rows returned".

Never run the same migration twice, and never edit a migration that has already been run. Changes always go in a
new numbered file. If you are not sure which ones you have already run, ask before running anything.

### 6. Fill in your secret settings

**You do this.** The app needs to know how to reach your Supabase project. These details are secrets, so they live
in a file called `.env.local` that is never uploaded to GitHub and that nobody (including Claude) should paste into
chat.

1. In your project folder, make a copy of `.env.example` and name the copy `.env.local`.
2. In Supabase, open **Project Settings**, then **API** (on newer dashboards it may be called **API Keys**).
3. Fill in each line of `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`: the **Project URL**.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the key labelled **anon** (newer dashboards call it **publishable**).
   - `SUPABASE_SERVICE_ROLE_KEY`: the key labelled **service_role** (newer dashboards call it **secret**). This one
     is powerful. Never share it and never put it in a screenshot.
   - `NEXT_PUBLIC_SITE_URL`: `http://localhost:3000`

### 7. Create the coach login

**You do this.** In the terminal, in the project folder, type the following. Replace the name, email and password
with your own. The password must be at least 12 characters.

```
npx tsx --env-file=.env.local scripts/create-coach.mts "Your Name" you@example.com "a-long-password"
```

You should see "Coach created". Clients are not made this way. You invite them from inside the app.

### 8. Start the app

```
npm run dev
```

Open `http://localhost:3000` in your browser. Sign in with the coach email and password using the link
**Coach? Sign in with a password**. To stop the app, click in the terminal and press `Ctrl` and `C` together.

## Everyday use

- Start the app: `npm run dev`, then open `http://localhost:3000`.
- The coach pages are under `/coach`. Click **Clients** to add a client. The app emails them an invite.
- Clients see a simple home page at `/today`. Their sessions will appear there once we build that part.

## What the app can do right now

- Sign in: clients by emailed link, the coach by password.
- The coach can invite clients and see who has accepted.
- Clients and coaches only ever see their own data (enforced by the database itself).
- A draft privacy notice at `/privacy`. A lawyer must review it before real clients use the app.
- Can be added to a phone home screen, with a plain "you are offline" page.
- **Exercise library** (coach only): add, edit and archive exercises. Tag each by body region, movement pattern, joint
  action and muscles (primary and secondary). Set the swap lists clients will be offered. Import a whole list from a
  CSV file.

- **Client profiles** (coach only): click a client's name on the Clients page. Enter testing numbers (max and resting
  heart rate, MAS, max speed, lactate threshold heart rate and power) and set what counts as high-speed running, as
  a percentage of MAS or max speed. Record 1RMs per exercise.

Programmes, sessions, training load and check-ins are not built yet.

## Client profiles

Click **Clients**, then a client's name.

- **Testing numbers:** speeds are typed in km/h, which is how MAS is usually quoted, and stored in metres per second.
  Leave a box empty if you do not have the number. The page works out where high-speed running starts and shows it
  under the form.
- **History:** every change to the testing numbers is kept, so past training can later be judged against the numbers
  that applied at the time.
- **1RMs:** type an exercise name from your library, the weight and the date. The latest entry for an exercise is the
  current 1RM, and percentage-based prescriptions will use it. To fix a mistake, add a new entry. Older entries stay
  as history and cannot be edited or deleted.

## The exercise library

Click **Exercises** in the coach menu.

- **Add an exercise:** name, type, video link, coaching notes, then the tags. Joint actions and muscles are set with
  drop-downs. Load will later be counted against every joint action you pick, in full. Primary muscles count in full
  and secondary muscles count for half.
- **Swap lists:** under each exercise, list the *similar* exercises (a like-for-like swap) and, if you want, a
  different exercise for each body area (for an injury or niggle). Clients are only ever offered what you list here.
  Type one exercise name per line, spelt exactly as it appears in your library.
- **Archive:** exercises are never deleted, because past sessions will point at them. Archiving hides one from the
  main list.
- **Needs review:** imported exercises are marked "Needs review" until you tick "I have checked these tags".

### Importing a list

1. In your spreadsheet, click **File**, then **Download**, then **Comma-separated values (.csv)**.
2. In the app, click **Exercises**, then **Import from a file**, choose the file and click **Read the file**.
3. Look through the table. Rows that are not exercises, repeats, and names you already have are unticked. The app
   proposes tags from the name. Rows it could not work out say so. Change anything in the table that is wrong.
4. Click **Import**. Nothing is saved before this. If anything goes wrong, nothing at all is saved.

Imported exercises can be refined one by one afterwards. Importing the same file again skips names you already have
and never overwrites your edits.

## Checks (for when we change the code)

```
npm run lint        # checks the code style
npm run typecheck   # checks for mistakes in the code
npm test            # runs automatic tests
npm run test:db     # runs the privacy tests against a throwaway database on your own computer
```

## Decisions on record

- Load attribution: each tagged joint action gets the full volume load of a set. Muscles are weighted (primary 1.0,
  secondary 0.5, editable). Region totals can exceed session totals and are labelled as such.
- Planned = the cycle-level target, prescribed = what is written in sessions, achieved = what was logged.
- The high-speed running threshold is a percentage of the client's MAS or max speed, set per client.
- 1RM values are auto-estimated from logged sets as well as entered by the coach.
- A client can flag an injury even when the coach has not set a replacement exercise. The coach is still notified.
- There are no clients under 18.

## How we work

One feature at a time. Each feature gets its own branch and a pull request on GitHub. You test it in the browser
before it is merged. Database changes are always new numbered files in `db/migrations`. More detail is in
`CLAUDE.md`.
