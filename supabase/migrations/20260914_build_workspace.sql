-- Project metadata inherits existing owner/editor/viewer RLS policies.
alter table public.projects add column specification jsonb not null default '{}'::jsonb
 check(jsonb_typeof(specification)='object' and pg_column_size(specification)<=20000);
alter table public.projects add column build_plan jsonb
 check(build_plan is null or (jsonb_typeof(build_plan)='object' and pg_column_size(build_plan)<=60000));
