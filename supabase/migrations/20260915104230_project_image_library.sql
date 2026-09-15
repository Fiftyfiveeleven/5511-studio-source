create table public.studio_project_images (
 id uuid primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 label text not null check(char_length(label) between 1 and 100),
 prompt text not null check(char_length(prompt) <= 4000),
 model text not null,
 status text not null check(status in ('generating','ready','failed')),
 data_url text check(char_length(data_url) <= 400000),
 original_data_url text check(char_length(original_data_url) <= 12000100),
 cost_usd numeric,
 error text,
 created_at timestamptz not null default now()
);
create unique index studio_image_label on public.studio_project_images(project_id,lower(label));
create index studio_image_project_created on public.studio_project_images(project_id,created_at desc);
alter table public.studio_project_images enable row level security;
grant select,insert,update on public.studio_project_images to authenticated;
grant all on public.studio_project_images to service_role;
create policy image_read on public.studio_project_images for select to authenticated using(studio_private.project_role(project_id) is not null);
create policy image_create on public.studio_project_images for insert to authenticated with check(created_by=(select auth.uid()) and studio_private.project_role(project_id) in ('owner','editor'));
create policy image_update on public.studio_project_images for update to authenticated using(studio_private.project_role(project_id) in ('owner','editor')) with check(studio_private.project_role(project_id) in ('owner','editor'));
