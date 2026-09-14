create table public.project_access (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 email text not null check(email=lower(trim(email)) and length(email) between 3 and 254),
 role text not null check(role in ('editor','viewer')),created_at timestamptz not null default now(),
 unique(project_id,email)
);
alter table public.project_access enable row level security;
revoke all on public.project_access from anon,authenticated;
grant select,insert,update,delete on public.project_access to authenticated;
create index project_access_email on public.project_access(email,project_id);
create function studio_private.project_role(p_project uuid) returns text language sql stable security definer set search_path='' as $$
 select case when p.owner_id=auth.uid() then 'owner' else (
 select a.role from public.project_access a join auth.users u on u.id=auth.uid()
 where a.project_id=p.id and a.email=lower(u.email) and u.email_confirmed_at is not null
 ) end from public.projects p where p.id=p_project;
$$;
revoke all on function studio_private.project_role(uuid) from public,anon;
grant execute on function studio_private.project_role(uuid) to authenticated;
create function public.project_role(p_project uuid) returns text language sql stable security invoker set search_path='' as $$select studio_private.project_role(p_project)$$;
revoke all on function public.project_role(uuid) from public,anon;
grant execute on function public.project_role(uuid) to authenticated;
create policy project_access_owner on public.project_access for all to authenticated using(studio_private.project_role(project_id)='owner') with check(studio_private.project_role(project_id)='owner');
drop policy projects_owner on public.projects;
create policy projects_read on public.projects for select to authenticated using(owner_id=(select auth.uid()) or studio_private.project_role(id) is not null);
create policy projects_create on public.projects for insert to authenticated with check(owner_id=(select auth.uid()));
create policy projects_edit on public.projects for update to authenticated using(studio_private.project_role(id) in ('owner','editor')) with check(studio_private.project_role(id) in ('owner','editor'));
create policy projects_delete on public.projects for delete to authenticated using(owner_id=(select auth.uid()));
create function studio_private.prevent_owner_change() returns trigger language plpgsql set search_path='' as $$begin if new.owner_id is distinct from old.owner_id or new.id is distinct from old.id then raise exception 'Project identity and ownership cannot be changed';end if;return new;end$$;
create trigger preserve_project_owner before update on public.projects for each row execute function studio_private.prevent_owner_change();
drop policy revisions_owner_read on public.revisions;
drop policy revisions_owner_insert on public.revisions;
create policy revisions_read on public.revisions for select to authenticated using(studio_private.project_role(project_id) is not null);
create policy revisions_create on public.revisions for insert to authenticated with check(studio_private.project_role(project_id) in ('owner','editor'));
create or replace function studio_private.begin_generation(p_project uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,1));
 if studio_private.project_role(p_project) is null or studio_private.project_role(p_project) not in ('owner','editor') then raise exception 'Project not found or editing is not allowed'; end if;
 update public.generation_runs set state='failed' where project_id=p_project and state='running' and created_at<now()-interval '6 minutes';
 if exists(select 1 from public.generation_runs where project_id=p_project and state='running') then raise exception 'Build running'; end if;
 if (select count(*) from public.generation_runs where owner_id=auth.uid() and created_at>now()-interval '24 hours')>=30 then raise exception 'Daily build limit'; end if;
 insert into public.generation_runs(project_id,owner_id) values(p_project,auth.uid()) returning id into result;return result;
end $$;
create or replace function studio_private.finish_generation(p_run uuid,p_prompt text,p_summary text,p_files jsonb,p_sql text,p_tokens integer,p_name text,p_expected_revision uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare run public.generation_runs; revision public.revisions;
begin
 select * into run from public.generation_runs where id=p_run and owner_id=auth.uid() and state='running' for update;
 if run.id is null then raise exception 'Invalid generation'; end if;
 perform id from public.projects where id=run.project_id for update;
 if studio_private.project_role(run.project_id) is null or studio_private.project_role(run.project_id) not in ('owner','editor') then raise exception 'Editing access was removed';end if;
 if not exists(select 1 from public.projects where id=run.project_id and current_revision_id is not distinct from p_expected_revision) then raise exception 'Project changed during generation'; end if;
 insert into public.revisions(project_id,prompt,summary,files,sql,tokens) values(run.project_id,p_prompt,p_summary,p_files,p_sql,p_tokens) returning * into revision;
 update public.projects set current_revision_id=revision.id,name=p_name,updated_at=now() where id=run.project_id;
 update public.generation_runs set state='completed' where id=p_run;return to_jsonb(revision);
end $$;
-- Zero-token saves and imports use the same atomic revision comparison as AI builds.
create function public.save_project_revision(p_project uuid,p_expected uuid,p_prompt text,p_files jsonb,p_sql text,p_tokens integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare revision public.revisions;
begin
 perform id from public.projects where id=p_project for update;
 if studio_private.project_role(p_project) is null or studio_private.project_role(p_project) not in ('owner','editor') then raise exception 'Editing is not allowed';end if;
 if not exists(select 1 from public.projects where id=p_project and current_revision_id is not distinct from p_expected) then raise exception 'Project changed. Reopen it before saving.';end if;
 if length(p_prompt)>6000 or length(p_sql)>50000 or pg_column_size(p_files)>600000 or p_tokens<0 then raise exception 'Invalid revision';end if;
 insert into public.revisions(project_id,prompt,summary,files,sql,tokens) values(p_project,p_prompt,'Saved without an AI request.',p_files,p_sql,p_tokens) returning * into revision;
 update public.projects set current_revision_id=revision.id,updated_at=now() where id=p_project;return to_jsonb(revision);
end$$;
revoke all on function public.save_project_revision(uuid,uuid,text,jsonb,text,integer) from public,anon;
grant execute on function public.save_project_revision(uuid,uuid,text,jsonb,text,integer) to authenticated;
create table public.project_drafts(
 project_id uuid not null references public.projects(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 prompt text not null default '' check(length(prompt)<=6000),images jsonb not null default '[]' check(jsonb_typeof(images)='array' and jsonb_array_length(images)<=3 and pg_column_size(images)<=1500000),
 updated_at timestamptz not null default now(),primary key(project_id,user_id)
);
alter table public.project_drafts enable row level security;
revoke all on public.project_drafts from anon,authenticated;
grant select,insert,update,delete on public.project_drafts to authenticated;
create policy draft_own on public.project_drafts for all to authenticated using(user_id=(select auth.uid()) and studio_private.project_role(project_id) in ('owner','editor')) with check(user_id=(select auth.uid()) and studio_private.project_role(project_id) in ('owner','editor'));
