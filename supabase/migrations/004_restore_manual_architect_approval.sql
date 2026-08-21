-- Restaura a aprovação manual de profissionais e registra CAU/ABD e Instagram.
-- Execute no SQL Editor do Supabase depois das migrations anteriores.

begin;

alter table public.architects
  add column if not exists registry_type text,
  add column if not exists registry_number text,
  add column if not exists instagram text;

alter table public.architects alter column status set default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'architects_registry_type_check'
      and conrelid = 'public.architects'::regclass
  ) then
    alter table public.architects
      add constraint architects_registry_type_check
      check (registry_type is null or registry_type in ('CAU', 'ABD'));
  end if;
end $$;

create unique index if not exists architects_registry_unique
  on public.architects (registry_type, upper(registry_number))
  where registry_type is not null and registry_number is not null;

create or replace function public.create_architect_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  professional_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  professional_registry_type text := upper(trim(coalesce(new.raw_user_meta_data ->> 'registry_type', '')));
  professional_registry_number text := upper(trim(coalesce(new.raw_user_meta_data ->> 'registry_number', '')));
  professional_instagram text := trim(coalesce(new.raw_user_meta_data ->> 'instagram', ''));
begin
  if new.raw_user_meta_data ->> 'account_type' = 'architect' then
    if length(professional_name) < 3
      or professional_registry_type not in ('CAU', 'ABD')
      or professional_registry_number !~ '^[A-Z0-9./-]{4,30}$'
      or professional_instagram !~ '^@[A-Za-z0-9._]{1,30}$'
    then
      raise exception 'Dados profissionais incompletos ou inválidos.' using errcode = '22023';
    end if;

    insert into public.architects (
      user_id,
      full_name,
      email,
      status,
      registry_type,
      registry_number,
      instagram
    )
    values (
      new.id,
      professional_name,
      new.email,
      'pending',
      professional_registry_type,
      professional_registry_number,
      professional_instagram
    )
    on conflict ((lower(email))) do update
      set user_id = excluded.user_id,
          full_name = excluded.full_name,
          registry_type = excluded.registry_type,
          registry_number = excluded.registry_number,
          instagram = excluded.instagram;
  end if;
  return new;
end;
$$;

drop policy if exists products_professional_read on public.products;
create policy products_professional_read on public.products
  for select to authenticated
  using (public.is_approved_architect() or public.is_admin());

revoke select on public.acabamentos from anon;
grant select on public.acabamentos to authenticated;
drop policy if exists finishes_public_read on public.acabamentos;
drop policy if exists finishes_professional_read on public.acabamentos;
create policy finishes_professional_read on public.acabamentos
  for select to authenticated
  using (public.is_approved_architect() or public.is_admin());

drop policy if exists technical_files_read on storage.objects;
create policy technical_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'arquivos-tecnicos'
    and (public.is_approved_architect() or public.is_admin())
  );

notify pgrst, 'reload schema';

commit;
