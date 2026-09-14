-- Non-secret per-project repository connection; protected by existing project RLS.
alter table public.projects add column if not exists github_connection jsonb;
alter table public.projects add constraint github_connection_size check (github_connection is null or (jsonb_typeof(github_connection)='object' and pg_column_size(github_connection)<4000));
create table public.studio_features (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 name text not null check(length(name) between 1 and 80),
 description text not null default '' check(length(description)<=2000),
 files jsonb not null check(jsonb_typeof(files)='array' and jsonb_array_length(files) between 1 and 80 and pg_column_size(files)<=600000),
 sql text not null default '' check(length(sql)<=50000),
 created_at timestamptz not null default now()
);
create index studio_features_owner on public.studio_features(owner_id);
alter table public.studio_features enable row level security;
revoke all on public.studio_features from anon,authenticated;
grant select,insert,delete on public.studio_features to authenticated;
create policy features_read on public.studio_features for select to authenticated using(owner_id=(select auth.uid()));
create policy features_create on public.studio_features for insert to authenticated with check(owner_id=(select auth.uid()));
create policy features_delete on public.studio_features for delete to authenticated using(owner_id=(select auth.uid()));
