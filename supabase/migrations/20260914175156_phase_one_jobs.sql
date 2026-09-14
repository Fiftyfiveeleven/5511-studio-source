create table public.studio_build_jobs(
 id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id), status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
 plan jsonb not null, images jsonb not null default '[]', runtime text not null check(runtime in ('browser','nextjs')),
 expected_revision uuid, stage integer not null default 0, workflow_id text, report jsonb, error text,
 cancel_requested boolean not null default false, created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index studio_job_project_active on public.studio_build_jobs(project_id) where status in ('queued','running');
create index studio_job_user_created on public.studio_build_jobs(user_id,created_at);
alter table public.studio_build_jobs enable row level security;
revoke all on public.studio_build_jobs from anon,authenticated;
grant select on public.studio_build_jobs to authenticated;
grant all on public.studio_build_jobs to service_role;
create policy studio_job_read on public.studio_build_jobs for select to authenticated using(studio_private.project_role(project_id) is not null);
create table public.studio_job_secrets(job_id uuid primary key references public.studio_build_jobs(id) on delete cascade,ciphertext text not null,expires_at timestamptz not null default now()+interval '2 hours');
alter table public.studio_job_secrets enable row level security;
revoke all on public.studio_job_secrets from public,anon,authenticated;
grant all on public.studio_job_secrets to service_role;
create function public.commit_studio_job(p_job uuid,p_stage integer,p_expected uuid,p_revision uuid,p_prompt text,p_summary text,p_files jsonb,p_sql text,p_tokens integer,p_name text) returns uuid language plpgsql security invoker set search_path='' as $$
declare j public.studio_build_jobs;p public.projects;u auth.users;
begin
 select * into j from public.studio_build_jobs where id=p_job for update;
 if not found then raise exception 'Job missing';end if;
 if j.stage>p_stage then return j.expected_revision;end if;
 if j.status not in ('queued','running') or j.cancel_requested or j.stage<>p_stage then raise exception 'Job no longer writable';end if;
 select * into p from public.projects where id=j.project_id for update;
 select * into u from auth.users where id=j.user_id;
 if u.id is null or (p.owner_id<>j.user_id and not exists(select 1 from public.project_access a where a.project_id=p.id and lower(a.email)=lower(u.email) and a.role='editor' and u.email_confirmed_at is not null)) then raise exception 'Editing access removed';end if;
 if p.current_revision_id is distinct from p_expected or j.expected_revision is distinct from p_expected then raise exception 'Project changed; saved version preserved';end if;
 insert into public.revisions(id,project_id,prompt,summary,files,sql,tokens) values(p_revision,p.id,p_prompt,p_summary,p_files,p_sql,p_tokens);
 update public.projects set current_revision_id=p_revision,name=p_name,updated_at=now() where id=p.id;
 update public.studio_build_jobs set stage=stage+1,expected_revision=p_revision,status='running',updated_at=now() where id=p_job;
 return p_revision;
end$$;
revoke all on function public.commit_studio_job(uuid,integer,uuid,uuid,text,text,jsonb,text,integer,text) from public,anon,authenticated;
grant execute on function public.commit_studio_job(uuid,integer,uuid,uuid,text,text,jsonb,text,integer,text) to service_role;
create function public.enqueue_studio_job(p_job jsonb,p_ciphertext text) returns uuid language plpgsql security invoker set search_path='' as $$
declare job_id uuid:=(p_job->>'id')::uuid;actor uuid:=(p_job->>'user_id')::uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(actor::text,1));
 if (select count(*) from public.studio_build_jobs where user_id=actor and created_at>now()-interval '24 hours')>=20 then raise exception 'Background job limit reached';end if;
 insert into public.studio_build_jobs(id,project_id,user_id,plan,images,runtime,expected_revision) values(job_id,(p_job->>'project_id')::uuid,actor,p_job->'plan',p_job->'images',p_job->>'runtime',(p_job->>'expected_revision')::uuid);
 insert into public.studio_job_secrets(job_id,ciphertext) values(job_id,p_ciphertext);
 return job_id;
end$$;
revoke all on function public.enqueue_studio_job(jsonb,text) from public,anon,authenticated;
grant execute on function public.enqueue_studio_job(jsonb,text) to service_role;
