-- One account, two sites: Oracle in Motion ('oim') and Network in Action ('nia') share this project.
-- Progress rows are tagged with the site so the same lesson id on both sites never collides.
-- profiles stays shared (name, avatar, goal follow the learner across sites).

do $$
declare
  t text;
  k text;
begin
  for t, k in select * from (values
      ('lesson_progress', 'lesson_id'),
      ('task_progress',   'task_key'),
      ('quiz_attempts',   'lesson_id'),
      ('bookmarks',       'lesson_id'),
      ('notes',           'lesson_id'),
      ('daily_activity',  'day')) v(t, k)
  loop
    execute format('alter table public.%I add column if not exists site text not null default %L', t, 'oim');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_site_check');
    execute format('alter table public.%I add constraint %I check (site in (%L, %L))', t, t || '_site_check', 'oim', 'nia');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_pkey');
    execute format('alter table public.%I add primary key (user_id, site, %I)', t, k);
  end loop;
end $$;
