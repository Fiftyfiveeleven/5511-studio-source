-- Private immutable version files. User-scoped clients enforce the same team roles as projects.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('studio-projects','studio-projects',false,1000000,array['application/json'])
on conflict(id) do update set public=false,file_size_limit=1000000,allowed_mime_types=array['application/json'];

create or replace function public.studio_storage_role(object_name text) returns text
language plpgsql stable security invoker set search_path='' as $$
declare project_id uuid;
begin
 if object_name !~ '^5511/projects/[0-9a-f-]{36}/revisions/[0-9a-f-]{36}\.json$' then return null; end if;
 begin project_id:=split_part(object_name,'/',3)::uuid;
 exception when invalid_text_representation then return null; end;
 return public.project_role(project_id);
end;$$;
revoke all on function public.studio_storage_role(text) from public;
grant execute on function public.studio_storage_role(text) to authenticated;
create policy studio_versions_read on storage.objects for select to authenticated
using(bucket_id='studio-projects' and public.studio_storage_role(name) is not null);
create policy studio_versions_insert on storage.objects for insert to authenticated
with check(bucket_id='studio-projects' and public.studio_storage_role(name) in ('owner','editor'));
-- No update/delete policy: saved files cannot be overwritten by an editor.

-- Encrypted, server-only ledger with optimistic compare-and-swap writes.
create table public.studio_usage_ledgers(
 id text primary key check(id ~ '^[0-9a-f]{64}$'),
 version bigint not null check(version>0),
 ciphertext text not null,
 updated_at timestamptz not null default now()
);
alter table public.studio_usage_ledgers enable row level security;
revoke all on public.studio_usage_ledgers from public,anon,authenticated;
grant select,insert,update on public.studio_usage_ledgers to service_role;
