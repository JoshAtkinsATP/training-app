-- People, role resolution, audit log and row level security.
-- Assumes Supabase: auth.users, auth.uid() and the `authenticated` role exist.

create extension if not exists pgcrypto;

create schema if not exists app;

create table coach (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete restrict,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table client (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid unique references auth.users (id) on delete restrict,
  coach_id           uuid not null references coach (id) on delete restrict,
  name               text not null,
  email              text not null,
  time_zone          text not null default 'Australia/Sydney',
  hr_max             smallint check (hr_max between 100 and 230),
  hr_rest            smallint check (hr_rest between 25 and 120),
  mas_ms             numeric(4,2) check (mas_ms > 0),
  max_speed_ms       numeric(4,2) check (max_speed_ms > 0),
  lt_hr              smallint check (lt_hr between 80 and 220),
  lt_power_w         smallint check (lt_power_w > 0),
  -- High-speed threshold, as a percentage of either MAS or max speed.
  hs_basis           text not null default 'mas' check (hs_basis in ('mas', 'max_speed')),
  hs_threshold_pct   numeric(5,2) not null default 100 check (hs_threshold_pct between 50 and 150),
  active             boolean not null default true,
  consented_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (coach_id, email)
);
create index client_coach_idx on client (coach_id);

create table audit_log (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  actor_user_id uuid not null,
  coach_id      uuid references coach (id),
  client_id     uuid references client (id),
  action        text not null,
  entity        text not null,
  entity_id     uuid,
  detail        jsonb not null default '{}'::jsonb
);
create index audit_log_client_idx on audit_log (client_id, at desc);

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger coach_touch  before update on coach  for each row execute function app.touch_updated_at();
create trigger client_touch before update on client for each row execute function app.touch_updated_at();

-- Role resolution. SECURITY DEFINER so policies can look up the caller's ids
-- without needing read access to the whole table, and without recursion.
create or replace function app.current_coach_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from coach where user_id = auth.uid()
$$;

create or replace function app.current_client_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from client where user_id = auth.uid() and active
$$;

-- Used by every later policy: may the caller see this client's data?
create or replace function app.can_access_client(target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from client c
    where c.id = target
      and (c.user_id = auth.uid() and c.active
           or c.coach_id = (select id from coach where user_id = auth.uid()))
  )
$$;

revoke all on function app.current_coach_id(), app.current_client_id(), app.can_access_client(uuid) from public;
grant usage on schema app to authenticated;
grant execute on function app.current_coach_id(), app.current_client_id(), app.can_access_client(uuid) to authenticated;

alter table coach     enable row level security;
alter table client    enable row level security;
alter table audit_log enable row level security;
alter table coach     force row level security;
alter table client    force row level security;
alter table audit_log force row level security;

-- coach: a coach sees and edits only their own row.
create policy coach_select on coach for select to authenticated using (user_id = auth.uid());
create policy coach_update on coach for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- client: coach manages their own clients; a client reads their own row.
create policy client_select on client for select to authenticated
  using (coach_id = app.current_coach_id() or (user_id = auth.uid() and active));
create policy client_insert on client for insert to authenticated
  with check (coach_id = app.current_coach_id());
create policy client_update_coach on client for update to authenticated
  using (coach_id = app.current_coach_id()) with check (coach_id = app.current_coach_id());
create policy client_update_self on client for update to authenticated
  using (user_id = auth.uid() and active) with check (user_id = auth.uid());

-- audit_log: insert your own events, coaches read events for their clients. Never update or delete.
create policy audit_insert on audit_log for insert to authenticated
  with check (actor_user_id = auth.uid()
              and (client_id is null or app.can_access_client(client_id)));

-- coach_id is derived from the client so a caller cannot write into another coach's log.
create or replace function app.audit_set_coach() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.coach_id = (select coach_id from client where id = new.client_id);
  return new;
end $$;
create trigger audit_set_coach before insert on audit_log
  for each row execute function app.audit_set_coach();
create policy audit_select on audit_log for select to authenticated
  using (coach_id = app.current_coach_id());

-- Column grants cannot differ between coach and client, so a trigger limits what a
-- client may change on their own row: name, time zone, and consent (once only).
-- Deliberately SECURITY INVOKER: current_user must be the caller's role. The service role
-- (used by invite handling on the server) is not 'authenticated', so it is not restricted.
create or replace function app.client_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and old.coach_id is distinct from app.current_coach_id() then
    if (new.hr_max, new.hr_rest, new.mas_ms, new.max_speed_ms, new.lt_hr, new.lt_power_w,
        new.hs_basis, new.hs_threshold_pct, new.active, new.coach_id, new.user_id, new.email)
       is distinct from
       (old.hr_max, old.hr_rest, old.mas_ms, old.max_speed_ms, old.lt_hr, old.lt_power_w,
        old.hs_basis, old.hs_threshold_pct, old.active, old.coach_id, old.user_id, old.email) then
      raise exception 'clients may only change their name, time zone and consent' using errcode = '42501';
    end if;
    if old.consented_at is not null and new.consented_at is distinct from old.consented_at then
      raise exception 'consent is already recorded' using errcode = '42501';
    end if;
  elsif current_user = 'authenticated' and new.consented_at is distinct from old.consented_at then
    raise exception 'only the client can record consent' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger client_guard before update on client for each row execute function app.client_guard();

-- Table privileges. Clients may only change a few profile fields on their own row;
-- row policies still limit which row. Coaches cannot rewrite who a client is linked to.
revoke all on coach, client, audit_log from authenticated;
grant select on coach, client to authenticated;
grant update (name) on coach to authenticated;
grant insert (coach_id, name, email, time_zone, hr_max, hr_rest, mas_ms, max_speed_ms,
              lt_hr, lt_power_w, hs_basis, hs_threshold_pct) on client to authenticated;
grant update (name, time_zone, hr_max, hr_rest, mas_ms, max_speed_ms, lt_hr, lt_power_w,
              hs_basis, hs_threshold_pct, active, consented_at) on client to authenticated;
grant insert on audit_log to authenticated;
grant select on audit_log to authenticated;
