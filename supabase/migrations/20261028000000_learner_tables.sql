-- Oracle in Motion: per-learner tables (replaces the single JSON blob in oim_profiles).
-- Every table is keyed by auth.users.id and locked to its owner with RLS.

-- ---------- profiles ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null default 'Learner' check (char_length(name) between 1 and 80),
  role          text not null default 'SQL & PL/SQL Developer' check (char_length(role) <= 60),
  goal_min      int  not null default 20 check (goal_min between 5 and 240),
  avatar_color  text not null default '#B1530A' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- progress ----------
create table if not exists public.lesson_progress (
  user_id       uuid not null references auth.users(id) on delete cascade,
  lesson_id     text not null check (char_length(lesson_id) <= 120),
  completed_at  timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists public.task_progress (
  user_id       uuid not null references auth.users(id) on delete cascade,
  task_key      text not null check (char_length(task_key) <= 130),  -- "<lesson_id>#<task index>"
  completed_at  timestamptz not null default now(),
  primary key (user_id, task_key)
);

create table if not exists public.quiz_attempts (
  user_id       uuid not null references auth.users(id) on delete cascade,
  lesson_id     text not null check (char_length(lesson_id) <= 120),
  answer        int  not null,
  correct       boolean not null,
  answered_at   timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists public.bookmarks (
  user_id       uuid not null references auth.users(id) on delete cascade,
  lesson_id     text not null check (char_length(lesson_id) <= 120),
  created_at    timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists public.notes (
  user_id       uuid not null references auth.users(id) on delete cascade,
  lesson_id     text not null check (char_length(lesson_id) <= 120),
  body          text not null check (char_length(body) <= 20000),
  updated_at    timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists public.daily_activity (
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null,
  seconds       int  not null default 0 check (seconds >= 0),
  lessons       int  not null default 0 check (lessons >= 0),
  tasks         int  not null default 0 check (tasks >= 0),
  quizzes       int  not null default 0 check (quizzes >= 0),
  primary key (user_id, day)
);

-- ---------- row level security: owner only ----------
alter table public.profiles        enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.task_progress   enable row level security;
alter table public.quiz_attempts   enable row level security;
alter table public.bookmarks       enable row level security;
alter table public.notes           enable row level security;
alter table public.daily_activity  enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['lesson_progress','task_progress','quiz_attempts','bookmarks','notes','daily_activity'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------- keep updated_at fresh ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- create a profile for every new user ----------
-- Name comes from the sign-up form (metadata "name") or the Google account ("full_name").
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(trim(left(coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'), 80)), ''),
             split_part(new.email, '@', 1), 'Learner')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for users who signed up before this migration.
insert into public.profiles (id, name)
select u.id, coalesce(nullif(trim(left(u.raw_user_meta_data->>'name', 80)), ''), split_part(u.email, '@', 1), 'Learner')
from auth.users u
on conflict (id) do nothing;

-- ---------- one-time copy of the old JSON blobs ----------
do $$
begin
  if to_regclass('public.oim_profiles') is null then return; end if;

  update public.profiles p set
    name         = coalesce(nullif(nullif(trim(left(o.data->'profile'->>'name', 80)), ''), 'Learner'), p.name),
    role         = coalesce(nullif(left(o.data->'profile'->>'role', 60), ''), p.role),
    goal_min     = case when (o.data->'profile'->>'goalMin') ~ '^\d{1,4}$'
                        then least(240, greatest(5, (o.data->'profile'->>'goalMin')::int)) else p.goal_min end,
    avatar_color = case when o.data->'profile'->>'avatarColor' ~ '^#[0-9A-Fa-f]{6}$'
                        then o.data->'profile'->>'avatarColor' else p.avatar_color end
  from public.oim_profiles o
  where o.user_id = p.id and o.data ? 'profile';

  insert into public.lesson_progress (user_id, lesson_id)
  select o.user_id, x from public.oim_profiles o, jsonb_array_elements_text(coalesce(o.data->'done', '[]')) x
  on conflict do nothing;

  insert into public.task_progress (user_id, task_key)
  select o.user_id, x from public.oim_profiles o, jsonb_array_elements_text(coalesce(o.data->'tasks', '[]')) x
  on conflict do nothing;

  insert into public.bookmarks (user_id, lesson_id)
  select o.user_id, x from public.oim_profiles o, jsonb_array_elements_text(coalesce(o.data->'bookmarks', '[]')) x
  on conflict do nothing;

  insert into public.notes (user_id, lesson_id, body)
  select o.user_id, n.key, n.value from public.oim_profiles o, jsonb_each_text(coalesce(o.data->'notes', '{}')) n
  where trim(n.value) <> ''
  on conflict do nothing;

  insert into public.quiz_attempts (user_id, lesson_id, answer, correct, answered_at)
  select o.user_id, q.key, (q.value->>'ans')::int, coalesce((q.value->>'ok')::boolean, false),
         case when (q.value->>'ts') ~ '^\d{1,15}$' then to_timestamp((q.value->>'ts')::bigint / 1000.0) else now() end
  from public.oim_profiles o, jsonb_each(coalesce(o.data->'quizzes', '{}')) q
  where (q.value->>'ans') ~ '^\d+$'
  on conflict do nothing;

  insert into public.daily_activity (user_id, day, seconds, lessons, tasks, quizzes)
  select o.user_id, a.key::date,
         coalesce((a.value->>'sec')::int, 0), coalesce((a.value->>'lessons')::int, 0),
         coalesce((a.value->>'tasks')::int, 0), coalesce((a.value->>'quizzes')::int, 0)
  from public.oim_profiles o, jsonb_each(coalesce(o.data->'activity', '{}')) a
  where a.key ~ '^\d{4}-\d{2}-\d{2}$'
  on conflict do nothing;
end $$;
