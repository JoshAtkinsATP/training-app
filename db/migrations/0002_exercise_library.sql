-- Exercise library: tag lists (regions, movement patterns, joints, joint actions, muscles),
-- exercises with their tags, swap lists, and an all-or-nothing import function.
-- Run after 0001. Never edit this file once it has been applied: add 0003 instead.

-- Which coach's library can the caller see? A coach sees their own, a client sees their coach's.
create or replace function app.my_coach_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select id from coach where user_id = auth.uid()),
    (select coach_id from client where user_id = auth.uid() and active)
  )
$$;
revoke all on function app.my_coach_id() from public;
grant execute on function app.my_coach_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Tag lists. Rows with coach_id null are the built-in starting lists and cannot be
-- changed by anyone signed in. A coach can add their own rows (coach_id set).
-- ---------------------------------------------------------------------------

create table region (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references coach (id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9_]+$'),
  name        text not null,
  position    smallint not null default 0
);

create table movement_pattern (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references coach (id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9_]+$'),
  name        text not null,
  position    smallint not null default 0
);

create table joint (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references coach (id) on delete cascade,
  region_id   uuid not null references region (id),
  slug        text not null check (slug ~ '^[a-z0-9_]+$'),
  name        text not null,
  position    smallint not null default 0
);

create table joint_action (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references coach (id) on delete cascade,
  joint_id    uuid not null references joint (id),
  slug        text not null check (slug ~ '^[a-z0-9_]+$'),
  name        text not null,
  position    smallint not null default 0
);

create table muscle (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references coach (id) on delete cascade,
  region_id   uuid not null references region (id),
  slug        text not null check (slug ~ '^[a-z0-9_]+$'),
  name        text not null,
  position    smallint not null default 0
);

-- One slug per owner. The zero uuid stands in for "built-in" so null rows are also unique.
create unique index region_slug_uq           on region           (coalesce(coach_id, '00000000-0000-0000-0000-000000000000'), slug);
create unique index movement_pattern_slug_uq on movement_pattern (coalesce(coach_id, '00000000-0000-0000-0000-000000000000'), slug);
create unique index joint_slug_uq            on joint            (coalesce(coach_id, '00000000-0000-0000-0000-000000000000'), slug);
create unique index joint_action_slug_uq     on joint_action     (coalesce(coach_id, '00000000-0000-0000-0000-000000000000'), slug);
create unique index muscle_slug_uq           on muscle           (coalesce(coach_id, '00000000-0000-0000-0000-000000000000'), slug);

-- ---------------------------------------------------------------------------
-- Exercises
-- ---------------------------------------------------------------------------

create table exercise (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             uuid not null references coach (id) on delete restrict,
  name                 text not null check (length(trim(name)) between 1 and 200),
  name_key             text generated always as (lower(trim(name))) stored,
  kind                 text not null default 'strength'
                         check (kind in ('strength', 'plyometric', 'conditioning', 'mobility', 'recovery', 'test', 'other')),
  description          text,
  video_url            text check (video_url is null or video_url ~* '^https?://'),
  equipment            text[] not null default '{}',
  is_unilateral        boolean not null default false,
  region_id            uuid references region (id),
  movement_pattern_id  uuid references movement_pattern (id),
  source               text not null default 'manual' check (source in ('manual', 'import')),
  -- Tags from the system the exercise came from (for example TrainHeroic). Kept for reference only.
  source_tags          text[] not null default '{}',
  review_status        text not null default 'reviewed' check (review_status in ('needs_review', 'reviewed')),
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (coach_id, id),
  unique (coach_id, name_key)
);
create index exercise_coach_idx on exercise (coach_id) where archived_at is null;
create trigger exercise_touch before update on exercise for each row execute function app.touch_updated_at();

-- Joint actions an exercise trains. The contraction type is stored now so an eccentric view can
-- be added later without changing the tables. Only 'concentric' is used for load for now.
create table exercise_joint_action (
  exercise_id       uuid not null references exercise (id) on delete cascade,
  joint_action_id   uuid not null references joint_action (id),
  contraction_type  text not null default 'concentric' check (contraction_type in ('concentric', 'eccentric', 'isometric')),
  primary key (exercise_id, joint_action_id, contraction_type)
);

-- Muscles an exercise trains. The weight is how much of a set's load counts towards that muscle.
create table exercise_muscle (
  exercise_id  uuid not null references exercise (id) on delete cascade,
  muscle_id    uuid not null references muscle (id),
  role         text not null check (role in ('primary', 'secondary')),
  weight       numeric(3,2) not null check (weight > 0 and weight <= 1),
  primary key (exercise_id, muscle_id)
);

-- Swap lists. Only exercises the coach lists here are ever offered to a client.
--   similar: a like-for-like swap (for example no equipment free).
--   injury:  a different exercise because of a niggle, chosen by body area.
create table exercise_swap_option (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid not null references coach (id) on delete cascade,
  exercise_id         uuid not null,
  option_exercise_id  uuid not null,
  kind                text not null check (kind in ('similar', 'injury')),
  body_area           text check (body_area in ('neck', 'shoulder', 'elbow', 'wrist_hand', 'upper_back', 'lower_back',
                                                'hip_groin', 'glute', 'thigh_front', 'hamstring', 'knee', 'calf_shin',
                                                'ankle_foot')),
  position            smallint not null default 0,
  -- Both exercises must belong to the same coach as the row.
  foreign key (coach_id, exercise_id)        references exercise (coach_id, id) on delete cascade,
  foreign key (coach_id, option_exercise_id) references exercise (coach_id, id) on delete cascade,
  check (exercise_id <> option_exercise_id),
  check ((kind = 'injury' and body_area is not null) or (kind = 'similar' and body_area is null))
);
create unique index exercise_swap_option_uq
  on exercise_swap_option (exercise_id, option_exercise_id, kind, coalesce(body_area, ''));
create index exercise_swap_option_exercise_idx on exercise_swap_option (exercise_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table region                enable row level security;
alter table movement_pattern      enable row level security;
alter table joint                 enable row level security;
alter table joint_action          enable row level security;
alter table muscle                enable row level security;
alter table exercise              enable row level security;
alter table exercise_joint_action enable row level security;
alter table exercise_muscle       enable row level security;
alter table exercise_swap_option  enable row level security;

-- Tag lists: everyone signed in reads the built-in rows and their coach's rows. Only a coach
-- changes their own rows. Built-in rows (coach_id null) match no write policy, so nobody can change them.
do $$
declare t text;
begin
  foreach t in array array['region', 'movement_pattern', 'joint', 'joint_action', 'muscle'] loop
    execute format('create policy %I on %I for select to authenticated using (coach_id is null or coach_id = app.my_coach_id())', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (coach_id = app.current_coach_id())', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (coach_id = app.current_coach_id()) with check (coach_id = app.current_coach_id())', t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (coach_id = app.current_coach_id())', t || '_delete', t);
    execute format('revoke all on %I from authenticated', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- Exercises: a coach and that coach's clients can read. Only the coach writes. There is no delete:
-- exercises are archived, because programmes and history will point at them.
create policy exercise_select on exercise for select to authenticated using (coach_id = app.my_coach_id());
create policy exercise_insert on exercise for insert to authenticated with check (coach_id = app.current_coach_id());
create policy exercise_update on exercise for update to authenticated
  using (coach_id = app.current_coach_id()) with check (coach_id = app.current_coach_id());

-- Tag links follow the exercise they belong to.
create policy eja_select on exercise_joint_action for select to authenticated
  using (exists (select 1 from exercise e where e.id = exercise_id and e.coach_id = app.my_coach_id()));
create policy eja_write on exercise_joint_action for all to authenticated
  using (exists (select 1 from exercise e where e.id = exercise_id and e.coach_id = app.current_coach_id()))
  with check (exists (select 1 from exercise e where e.id = exercise_id and e.coach_id = app.current_coach_id()));

create policy em_select on exercise_muscle for select to authenticated
  using (exists (select 1 from exercise e where e.id = exercise_id and e.coach_id = app.my_coach_id()));
create policy em_write on exercise_muscle for all to authenticated
  using (exists (select 1 from exercise e where e.id = exercise_id and e.coach_id = app.current_coach_id()))
  with check (exists (select 1 from exercise e where e.id = exercise_id and e.coach_id = app.current_coach_id()));

create policy swap_select on exercise_swap_option for select to authenticated using (coach_id = app.my_coach_id());
create policy swap_write on exercise_swap_option for all to authenticated
  using (coach_id = app.current_coach_id()) with check (coach_id = app.current_coach_id());

revoke all on exercise, exercise_joint_action, exercise_muscle, exercise_swap_option from authenticated;
grant select, insert on exercise to authenticated;
grant update (name, kind, description, video_url, equipment, is_unilateral, region_id, movement_pattern_id,
              review_status, archived_at) on exercise to authenticated;
grant select, insert, update, delete on exercise_joint_action, exercise_muscle, exercise_swap_option to authenticated;

-- ---------------------------------------------------------------------------
-- Built-in starting lists
-- ---------------------------------------------------------------------------

insert into region (slug, name, position) values
  ('lower_body', 'Lower body', 1),
  ('upper_body', 'Upper body', 2),
  ('trunk',      'Trunk',      3),
  ('whole_body', 'Whole body', 4);

insert into movement_pattern (slug, name, position) values
  ('squat',           'Squat',                1),
  ('hinge',           'Hinge',                2),
  ('lunge',           'Lunge and split stance', 3),
  ('push_horizontal', 'Horizontal push',      4),
  ('push_vertical',   'Vertical push',        5),
  ('pull_horizontal', 'Horizontal pull',      6),
  ('pull_vertical',   'Vertical pull',        7),
  ('carry',           'Carry',                8),
  ('core_brace',      'Core brace',           9),
  ('rotation',        'Rotation',            10),
  ('jump',            'Jump and land',       11),
  ('sprint_run',      'Sprint and run',      12),
  ('throw',           'Throw',               13),
  ('olympic',         'Olympic and power',   14),
  ('isolation',       'Isolation',           15),
  ('locomotion',      'Crawl and walk', 16),
  ('mobility',        'Mobility and stretch', 17);

insert into joint (region_id, slug, name, position)
select r.id, v.slug, v.name, v.position
from (values
  ('lower_body', 'ankle',    'Ankle',    1),
  ('lower_body', 'knee',     'Knee',     2),
  ('lower_body', 'hip',      'Hip',      3),
  ('trunk',      'spine',    'Trunk and spine', 4),
  ('upper_body', 'scapula',  'Shoulder blade', 5),
  ('upper_body', 'shoulder', 'Shoulder', 6),
  ('upper_body', 'elbow',    'Elbow',    7),
  ('upper_body', 'wrist',    'Wrist',    8),
  ('upper_body', 'neck',     'Neck',     9)
) as v(region, slug, name, position)
join region r on r.slug = v.region and r.coach_id is null;

insert into joint_action (joint_id, slug, name, position)
select j.id, v.slug, v.name, v.position
from (values
  ('ankle',    'ankle_plantar_flexion',        'Ankle plantar flexion', 1),
  ('ankle',    'ankle_dorsiflexion',           'Ankle dorsiflexion', 2),
  ('knee',     'knee_extension',               'Knee extension', 1),
  ('knee',     'knee_flexion',                 'Knee flexion', 2),
  ('hip',      'hip_extension',                'Hip extension', 1),
  ('hip',      'hip_flexion',                  'Hip flexion', 2),
  ('hip',      'hip_abduction',                'Hip abduction', 3),
  ('hip',      'hip_adduction',                'Hip adduction', 4),
  ('hip',      'hip_external_rotation',        'Hip external rotation', 5),
  ('hip',      'hip_internal_rotation',        'Hip internal rotation', 6),
  ('spine',    'trunk_flexion',                'Trunk flexion', 1),
  ('spine',    'trunk_extension',              'Trunk extension', 2),
  ('spine',    'trunk_lateral_flexion',        'Trunk lateral flexion', 3),
  ('spine',    'trunk_rotation',               'Trunk rotation', 4),
  ('scapula',  'scapular_protraction',         'Scapular protraction', 1),
  ('scapula',  'scapular_retraction',          'Scapular retraction', 2),
  ('scapula',  'scapular_elevation',           'Scapular elevation', 3),
  ('scapula',  'scapular_depression',          'Scapular depression', 4),
  ('shoulder', 'shoulder_flexion',             'Shoulder flexion', 1),
  ('shoulder', 'shoulder_extension',           'Shoulder extension', 2),
  ('shoulder', 'shoulder_abduction',           'Shoulder abduction', 3),
  ('shoulder', 'shoulder_adduction',           'Shoulder adduction', 4),
  ('shoulder', 'shoulder_horizontal_adduction','Shoulder horizontal adduction', 5),
  ('shoulder', 'shoulder_horizontal_abduction','Shoulder horizontal abduction', 6),
  ('shoulder', 'shoulder_internal_rotation',   'Shoulder internal rotation', 7),
  ('shoulder', 'shoulder_external_rotation',   'Shoulder external rotation', 8),
  ('elbow',    'elbow_flexion',                'Elbow flexion', 1),
  ('elbow',    'elbow_extension',              'Elbow extension', 2),
  ('wrist',    'wrist_flexion',                'Wrist flexion', 1),
  ('wrist',    'wrist_extension',              'Wrist extension', 2),
  ('neck',     'neck_flexion',                 'Neck flexion', 1),
  ('neck',     'neck_extension',               'Neck extension', 2),
  ('neck',     'neck_lateral_flexion',         'Neck lateral flexion', 3)
) as v(joint, slug, name, position)
join joint j on j.slug = v.joint and j.coach_id is null;

insert into muscle (region_id, slug, name, position)
select r.id, v.slug, v.name, v.position
from (values
  ('lower_body', 'quadriceps',          'Quadriceps', 1),
  ('lower_body', 'hamstrings',          'Hamstrings', 2),
  ('lower_body', 'gluteus_maximus',     'Gluteus maximus', 3),
  ('lower_body', 'gluteus_medius',      'Gluteus medius and minimus', 4),
  ('lower_body', 'hip_adductors',       'Hip adductors', 5),
  ('lower_body', 'hip_flexors',         'Hip flexors', 6),
  ('lower_body', 'gastrocnemius',       'Gastrocnemius', 7),
  ('lower_body', 'soleus',              'Soleus', 8),
  ('lower_body', 'tibialis_anterior',   'Tibialis anterior', 9),
  ('trunk',      'rectus_abdominis',    'Rectus abdominis', 1),
  ('trunk',      'obliques',            'Obliques', 2),
  ('trunk',      'transversus_abdominis','Transversus abdominis', 3),
  ('trunk',      'erector_spinae',      'Erector spinae', 4),
  ('trunk',      'quadratus_lumborum',  'Quadratus lumborum', 5),
  ('upper_body', 'pectoralis_major',    'Pectoralis major', 1),
  ('upper_body', 'latissimus_dorsi',    'Latissimus dorsi', 2),
  ('upper_body', 'deltoid_anterior',    'Deltoid (front)', 3),
  ('upper_body', 'deltoid_lateral',     'Deltoid (side)', 4),
  ('upper_body', 'deltoid_posterior',   'Deltoid (rear)', 5),
  ('upper_body', 'trapezius_upper',     'Trapezius (upper)', 6),
  ('upper_body', 'trapezius_mid_lower', 'Trapezius (middle and lower)', 7),
  ('upper_body', 'rhomboids',           'Rhomboids', 8),
  ('upper_body', 'rotator_cuff',        'Rotator cuff', 9),
  ('upper_body', 'serratus_anterior',   'Serratus anterior', 10),
  ('upper_body', 'biceps_brachii',      'Biceps', 11),
  ('upper_body', 'brachialis',          'Brachialis and brachioradialis', 12),
  ('upper_body', 'triceps_brachii',     'Triceps', 13),
  ('upper_body', 'forearm_flexors',     'Forearm flexors', 14),
  ('upper_body', 'forearm_extensors',   'Forearm extensors', 15)
) as v(region, slug, name, position)
join region r on r.slug = v.region and r.coach_id is null;

-- ---------------------------------------------------------------------------
-- Import. One call, all or nothing, and it runs as the signed-in coach so the
-- row level security above still applies. Existing exercises (same name) are skipped, never overwritten.
-- Each item: name, kind, description, video_url, equipment[], is_unilateral, region, pattern,
--   source_tags[], review_status, joint_actions[{slug, contraction}], muscles[{slug, role}], similar[names].
-- ---------------------------------------------------------------------------

create or replace function app.tax_id(tbl text, wanted text) returns uuid
language plpgsql stable set search_path = public, pg_temp as $$
declare found uuid;
begin
  if wanted is null or wanted = '' then return null; end if;
  if tbl not in ('region', 'movement_pattern', 'joint_action', 'muscle') then
    raise exception 'unknown list %', tbl using errcode = '22023';
  end if;
  -- The coach's own row wins over the built-in one if both exist.
  execute format('select id from %I where slug = $1 order by (coach_id is null) limit 1', tbl) into found using wanted;
  if found is null then
    raise exception 'unknown % "%"', tbl, wanted using errcode = '22023';
  end if;
  return found;
end $$;
revoke all on function app.tax_id(text, text) from public;
grant execute on function app.tax_id(text, text) to authenticated;

create or replace function public.import_exercises(items jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  me        uuid := app.current_coach_id();
  it        jsonb;
  new_id    uuid;
  from_id   uuid;
  to_id     uuid;
  nm        text;
  created_ids uuid[] := '{}';
  n_created int := 0;
  n_skipped int := 0;
  n_swaps   int := 0;
  n_missing int := 0;
  rows_added int;
begin
  if me is null then
    raise exception 'only a coach can import exercises' using errcode = '42501';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) > 2000 then
    raise exception 'items must be a list of at most 2000 exercises' using errcode = '22023';
  end if;

  for it in select * from jsonb_array_elements(items) loop
    new_id := null;
    insert into exercise (coach_id, name, kind, description, video_url, equipment, is_unilateral,
                          region_id, movement_pattern_id, source, source_tags, review_status)
    values (
      me,
      it->>'name',
      coalesce(nullif(it->>'kind', ''), 'strength'),
      nullif(it->>'description', ''),
      nullif(it->>'video_url', ''),
      coalesce(array(select jsonb_array_elements_text(it->'equipment')), '{}'),
      coalesce((it->>'is_unilateral')::boolean, false),
      app.tax_id('region', it->>'region'),
      app.tax_id('movement_pattern', it->>'pattern'),
      'import',
      coalesce(array(select jsonb_array_elements_text(it->'source_tags')), '{}'),
      coalesce(nullif(it->>'review_status', ''), 'needs_review')
    )
    on conflict (coach_id, name_key) do nothing
    returning id into new_id;

    if new_id is null then
      n_skipped := n_skipped + 1;
      continue;
    end if;
    n_created := n_created + 1;
    created_ids := created_ids || new_id;

    insert into exercise_joint_action (exercise_id, joint_action_id, contraction_type)
    select distinct new_id, app.tax_id('joint_action', j->>'slug'), coalesce(nullif(j->>'contraction', ''), 'concentric')
    from jsonb_array_elements(coalesce(it->'joint_actions', '[]'::jsonb)) j;

    insert into exercise_muscle (exercise_id, muscle_id, role, weight)
    select new_id, app.tax_id('muscle', m->>'slug'), m->>'role', case m->>'role' when 'primary' then 1.0 else 0.5 end
    from jsonb_array_elements(coalesce(it->'muscles', '[]'::jsonb)) m
    on conflict do nothing;
  end loop;

  -- Second pass, once every exercise exists: like-for-like swap lists, matched by name.
  for it in select * from jsonb_array_elements(items) loop
    select id into from_id from exercise where coach_id = me and name_key = lower(trim(it->>'name'));
    -- Only exercises created by this import get swap lists, so a re-import never re-adds ones the coach removed.
    if from_id is null or not (from_id = any(created_ids)) then continue; end if;
    for nm in select jsonb_array_elements_text(coalesce(it->'similar', '[]'::jsonb)) loop
      select id into to_id from exercise where coach_id = me and name_key = lower(trim(nm));
      if to_id is null or to_id = from_id then
        n_missing := n_missing + 1;
        continue;
      end if;
      insert into exercise_swap_option (coach_id, exercise_id, option_exercise_id, kind)
      values (me, from_id, to_id, 'similar')
      on conflict do nothing;
      get diagnostics rows_added = row_count;
      n_swaps := n_swaps + rows_added;
    end loop;
  end loop;

  return jsonb_build_object('created', n_created, 'skipped', n_skipped,
                            'swaps_added', n_swaps, 'swaps_unmatched', n_missing);
end $$;

revoke all on function public.import_exercises(jsonb) from public;
grant execute on function public.import_exercises(jsonb) to authenticated;
