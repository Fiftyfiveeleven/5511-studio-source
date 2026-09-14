-- The worker may commit a checkpoint, but must not receive general access to auth.users.
-- This narrowly scoped function still checks ownership, editor access, cancellation,
-- stage order and the expected revision. Only the server role may execute it.
alter function public.commit_studio_job(uuid,integer,uuid,uuid,text,text,jsonb,text,integer,text) security definer;
alter function public.commit_studio_job(uuid,integer,uuid,uuid,text,text,jsonb,text,integer,text) set search_path='';
revoke all on function public.commit_studio_job(uuid,integer,uuid,uuid,text,text,jsonb,text,integer,text) from public,anon,authenticated;
grant execute on function public.commit_studio_job(uuid,integer,uuid,uuid,text,text,jsonb,text,integer,text) to service_role;
alter table public.studio_build_jobs add column if not exists progress text;
