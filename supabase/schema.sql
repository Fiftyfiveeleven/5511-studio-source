-- Run in a dedicated Studio Supabase project. Generated apps use separate connections.
create table public.projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), description text not null default '',
 supabase_url text, supabase_key text, vercel_project_id text, deployment_url text, current_revision_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index projects_owner on public.projects(owner_id);
create table public.revisions (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 prompt text not null,summary text not null,files jsonb not null,sql text not null default '',tokens integer not null default 0,
 created_at timestamptz not null default now(), unique(project_id,id)
);
alter table public.projects add constraint current_revision_owns_project foreign key(id,current_revision_id) references public.revisions(project_id,id) deferrable initially deferred;
create index revisions_project on public.revisions(project_id,created_at desc);
create table public.generation_runs (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id),state text not null default 'running' check(state in ('running','completed','failed')),
 created_at timestamptz not null default now()
);
create index generation_owner on public.generation_runs(owner_id,created_at);
create table public.deployments (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 revision_id uuid not null,vercel_id text,url text,state text not null,created_at timestamptz not null default now(),
 foreign key(project_id,revision_id) references public.revisions(project_id,id)
);
create index deployments_project on public.deployments(project_id,created_at desc);
alter table public.projects enable row level security;
alter table public.revisions enable row level security;
alter table public.generation_runs enable row level security;
alter table public.deployments enable row level security;
grant select,insert,update,delete on public.projects to authenticated;
grant select,insert on public.revisions to authenticated;
grant select on public.generation_runs to authenticated;
grant select,insert,update on public.deployments to authenticated;
create schema if not exists studio_private;
revoke all on schema studio_private from public;
grant usage on schema studio_private to authenticated;
create policy projects_owner on public.projects for all to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy revisions_owner_read on public.revisions for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy revisions_owner_insert on public.revisions for insert to authenticated with check(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy runs_owner on public.generation_runs for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy deployments_owner on public.deployments for all to authenticated using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));

create function studio_private.begin_generation(p_project uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if not exists(select 1 from public.projects where id=p_project and owner_id=auth.uid()) then raise exception 'Project not found'; end if;
 update public.generation_runs set state='failed' where project_id=p_project and state='running' and created_at<now()-interval '6 minutes';
 if exists(select 1 from public.generation_runs where project_id=p_project and state='running') then raise exception 'Build running'; end if;
 if (select count(*) from public.generation_runs where owner_id=auth.uid() and created_at>now()-interval '24 hours')>=30 then raise exception 'Daily build limit'; end if;
 insert into public.generation_runs(project_id,owner_id) values(p_project,auth.uid()) returning id into result;
 return result;
end $$;
create function studio_private.fail_generation(p_run uuid) returns void language sql security definer set search_path='' as $$update public.generation_runs set state='failed' where id=p_run and owner_id=auth.uid() and state='running';$$;
create function studio_private.finish_generation(p_run uuid,p_prompt text,p_summary text,p_files jsonb,p_sql text,p_tokens integer,p_name text,p_expected_revision uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare run public.generation_runs; revision public.revisions;
begin
 select * into run from public.generation_runs where id=p_run and owner_id=auth.uid() and state='running' for update;
 if run.id is null then raise exception 'Invalid generation'; end if;
 perform id from public.projects where id=run.project_id for update;
 if not exists(select 1 from public.projects where id=run.project_id and current_revision_id is not distinct from p_expected_revision) then raise exception 'Project changed during generation'; end if;
 insert into public.revisions(project_id,prompt,summary,files,sql,tokens) values(run.project_id,p_prompt,p_summary,p_files,p_sql,p_tokens) returning * into revision;
 update public.projects set current_revision_id=revision.id,name=p_name,updated_at=now() where id=run.project_id;
 update public.generation_runs set state='completed' where id=p_run;
 return to_jsonb(revision);
end $$;
revoke all on function studio_private.begin_generation(uuid),studio_private.fail_generation(uuid),studio_private.finish_generation(uuid,text,text,jsonb,text,integer,text,uuid) from public,anon;
grant execute on function studio_private.begin_generation(uuid),studio_private.fail_generation(uuid),studio_private.finish_generation(uuid,text,text,jsonb,text,integer,text,uuid) to authenticated;

-- Public RPC wrappers never run with elevated privileges. Private implementations
-- validate auth.uid() and project ownership before accessing protected run records.
create function public.begin_generation(p_project uuid) returns uuid language sql security invoker set search_path='' as $$select studio_private.begin_generation(p_project);$$;
create function public.fail_generation(p_run uuid) returns void language sql security invoker set search_path='' as $$select studio_private.fail_generation(p_run);$$;
create function public.finish_generation(p_run uuid,p_prompt text,p_summary text,p_files jsonb,p_sql text,p_tokens integer,p_name text,p_expected_revision uuid) returns jsonb language sql security invoker set search_path='' as $$select studio_private.finish_generation(p_run,p_prompt,p_summary,p_files,p_sql,p_tokens,p_name,p_expected_revision);$$;
revoke all on function public.begin_generation(uuid),public.fail_generation(uuid),public.finish_generation(uuid,text,text,jsonb,text,integer,text,uuid) from public,anon;
grant execute on function public.begin_generation(uuid),public.fail_generation(uuid),public.finish_generation(uuid,text,text,jsonb,text,integer,text,uuid) to authenticated;
