create or replace function studio_private.begin_generation(p_project uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,1));
 if studio_private.project_role(p_project) is null or studio_private.project_role(p_project) not in ('owner','editor') then raise exception 'Project not found or editing is not allowed'; end if;
 update public.generation_runs set state='failed' where project_id=p_project and state='running' and created_at<now()-interval '6 minutes';
 if exists(select 1 from public.generation_runs where project_id=p_project and state='running') then raise exception 'Build running'; end if;
 insert into public.generation_runs(project_id,owner_id) values(p_project,auth.uid()) returning id into result;return result;
end $$;

create or replace function public.enqueue_studio_job(p_job jsonb,p_ciphertext text) returns uuid language plpgsql security invoker set search_path='' as $$
declare job_id uuid:=(p_job->>'id')::uuid;actor uuid:=(p_job->>'user_id')::uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(actor::text,1));
 insert into public.studio_build_jobs(id,project_id,user_id,plan,images,runtime,expected_revision) values(job_id,(p_job->>'project_id')::uuid,actor,p_job->'plan',p_job->'images',p_job->>'runtime',(p_job->>'expected_revision')::uuid);
 insert into public.studio_job_secrets(job_id,ciphertext) values(job_id,p_ciphertext);
 return job_id;
end$$;
revoke all on function public.enqueue_studio_job(jsonb,text) from public,anon,authenticated;
grant execute on function public.enqueue_studio_job(jsonb,text) to service_role;
