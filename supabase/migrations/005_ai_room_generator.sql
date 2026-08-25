-- Estrutura privada do gerador de ambientações do Portal do Profissional.
-- Execute depois da migration 004_restore_manual_architect_approval.sql.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ai-projects',
  'ai-projects',
  false,
  12582912,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ai_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  texture_id text not null,
  input_path text not null,
  mask_path text not null,
  result_path text,
  provider text not null default 'demo',
  model text,
  quality text not null default 'draft'
    check (quality in ('draft', 'final')),
  prompt text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_generation_jobs_user_created_idx
  on public.ai_generation_jobs (user_id, created_at desc);

alter table public.ai_generation_jobs enable row level security;
revoke all on public.ai_generation_jobs from anon;
revoke all on public.ai_generation_jobs from authenticated;
grant select on public.ai_generation_jobs to authenticated;

drop policy if exists ai_generation_jobs_own_read
  on public.ai_generation_jobs;
create policy ai_generation_jobs_own_read
  on public.ai_generation_jobs
  for select to authenticated
  using (
    (user_id = auth.uid() and public.is_approved_architect())
    or public.is_admin()
  );

drop policy if exists ai_projects_read on storage.objects;
drop policy if exists ai_projects_insert on storage.objects;
drop policy if exists ai_projects_delete on storage.objects;

create policy ai_projects_read
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ai-projects'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.is_approved_architect() or public.is_admin())
  );

create policy ai_projects_insert
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ai-projects'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.is_approved_architect() or public.is_admin())
  );

create policy ai_projects_delete
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ai-projects'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.is_approved_architect() or public.is_admin())
  );

notify pgrst, 'reload schema';

commit;
