drop index public.studio_job_project_active;
create unique index studio_job_project_active on public.studio_build_jobs(project_id, (coalesce(jsonb_array_length(plan->'stages'),0)>0)) where status in ('queued','running');
