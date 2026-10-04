-- Client profiles: 1RM records per exercise, and a history of testing numbers.
-- Run after 0002. Never edit this file once it has been applied: add the next number instead.

-- Lets other tables point at "this client, who belongs to this coach" so a row can never
-- link a client to another coach's data. Adds a rule only. No data changes.
alter table client add constraint client_coach_id_id_uq unique (coach_id, id);

-- ---------------------------------------------------------------------------
-- 1RM records. Each entry is kept. The latest one for an exercise is the current 1RM,
-- so older values stay as history. Entries are corrected by adding a new one.
-- ---------------------------------------------------------------------------

create table client_exercise_max (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null,
  client_id    uuid not null,
  exercise_id  uuid not null,
  e1rm_kg      numeric(6,2) not null check (e1rm_kg > 0 and e1rm_kg <= 1000),
  -- entered: the coach typed it in. tested: a real max test. estimated: worked out from logged sets later.
  source       text not null default 'entered' check (source in ('entered', 'tested', 'estimated')),
  measured_on  date not null default current_date,
  note         text check (note is null or length(note) <= 500),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  -- The client and the exercise must both belong to the coach on the row.
  foreign key (coach_id, client_id)   references client (coach_id, id),
  foreign key (coach_id, exercise_id) references exercise (coach_id, id)
);
create index client_exercise_max_lookup
  on client_exercise_max (client_id, exercise_id, measured_on desc, created_at desc);

alter table client_exercise_max enable row level security;

-- A client sees their own records. A coach sees their own clients' records.
create policy cem_select on client_exercise_max for select to authenticated
  using (app.can_access_client(client_id));
-- Only the coach adds records. There is no update or delete.
create policy cem_insert on client_exercise_max for insert to authenticated
  with check (coach_id = app.current_coach_id());

revoke all on client_exercise_max from authenticated;
grant select on client_exercise_max to authenticated;
grant insert (coach_id, client_id, exercise_id, e1rm_kg, source, measured_on, note) on client_exercise_max to authenticated;

-- ---------------------------------------------------------------------------
-- Testing history. Every time a client's testing numbers change, a snapshot is saved,
-- so load measured later can be judged against the numbers that applied at the time.
-- Written only by the trigger below. Nobody signed in can write to it directly.
-- ---------------------------------------------------------------------------

create table client_testing_history (
  id                bigint generated always as identity primary key,
  client_id         uuid not null references client (id),
  recorded_at       timestamptz not null default now(),
  recorded_by       uuid,
  hr_max            smallint,
  hr_rest           smallint,
  mas_ms            numeric(4,2),
  max_speed_ms      numeric(4,2),
  lt_hr             smallint,
  lt_power_w        smallint,
  hs_basis          text not null,
  hs_threshold_pct  numeric(5,2) not null
);
create index client_testing_history_idx on client_testing_history (client_id, recorded_at desc);

alter table client_testing_history enable row level security;
create policy cth_select on client_testing_history for select to authenticated
  using (app.can_access_client(client_id));
revoke all on client_testing_history from authenticated;
grant select on client_testing_history to authenticated;

create or replace function app.record_testing_history() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    -- A brand new client with no numbers yet has nothing worth recording.
    if new.hr_max is null and new.hr_rest is null and new.mas_ms is null and new.max_speed_ms is null
       and new.lt_hr is null and new.lt_power_w is null then
      return new;
    end if;
  end if;
  insert into client_testing_history
    (client_id, recorded_by, hr_max, hr_rest, mas_ms, max_speed_ms, lt_hr, lt_power_w, hs_basis, hs_threshold_pct)
  values
    (new.id, auth.uid(), new.hr_max, new.hr_rest, new.mas_ms, new.max_speed_ms, new.lt_hr, new.lt_power_w,
     new.hs_basis, new.hs_threshold_pct);
  return new;
end $$;

create trigger client_testing_history_ins after insert on client
  for each row execute function app.record_testing_history();

create trigger client_testing_history_upd after update on client
  for each row
  when (
    (old.hr_max, old.hr_rest, old.mas_ms, old.max_speed_ms, old.lt_hr, old.lt_power_w, old.hs_basis, old.hs_threshold_pct)
    is distinct from
    (new.hr_max, new.hr_rest, new.mas_ms, new.max_speed_ms, new.lt_hr, new.lt_power_w, new.hs_basis, new.hs_threshold_pct)
  )
  execute function app.record_testing_history();
