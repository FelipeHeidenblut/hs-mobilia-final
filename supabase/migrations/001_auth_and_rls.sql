-- Execute este arquivo no SQL Editor do Supabase antes de publicar a nova versão.
-- Faça um backup do banco antes da aplicação em produção.

begin;

alter table public.architects add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.architects alter column status set default 'approved';
update public.architects set status = 'approved' where status = 'pending';
create unique index if not exists architects_email_unique on public.architects (lower(email));
create unique index if not exists architects_user_id_unique on public.architects (user_id) where user_id is not null;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.is_approved_architect()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.architects
    where user_id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.create_architect_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ->> 'account_type' = 'architect' then
    insert into public.architects (user_id, full_name, email, status)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, 'approved')
    on conflict ((lower(email))) do update set user_id = excluded.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_architect_auth_created on auth.users;
create trigger on_architect_auth_created
  after insert on auth.users
  for each row execute procedure public.create_architect_profile();

alter table public.products enable row level security;
alter table public.architects enable row level security;
alter table public.blog_posts enable row level security;
alter table public.acabamentos enable row level security;
alter table public.admin_users enable row level security;

do $$
declare policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('products', 'architects', 'blog_posts', 'acabamentos', 'admin_users')
  loop
    execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end $$;

drop view if exists public.public_products;
create view public.public_products as
select id, name, brand, category, description, image_url, galeria_urls
from public.products;

revoke all on public.products from anon;
grant select on public.public_products to anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;

create policy products_professional_read on public.products
  for select to authenticated
  using (auth.uid() is not null);
create policy products_admin_insert on public.products
  for insert to authenticated with check (public.is_admin());
create policy products_admin_update on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_admin_delete on public.products
  for delete to authenticated using (public.is_admin());

grant select on public.architects to authenticated;
grant update on public.architects to authenticated;
create policy architects_own_read on public.architects
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy architects_admin_update on public.architects
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.admin_users to authenticated;
create policy admin_users_own_read on public.admin_users
  for select to authenticated using (user_id = auth.uid());

grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;
create policy blog_public_read on public.blog_posts
  for select to anon, authenticated using (publicado = true or public.is_admin());
create policy blog_admin_insert on public.blog_posts
  for insert to authenticated with check (public.is_admin());
create policy blog_admin_update on public.blog_posts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy blog_admin_delete on public.blog_posts
  for delete to authenticated using (public.is_admin());

grant select on public.acabamentos to anon, authenticated;
grant insert, update, delete on public.acabamentos to authenticated;
create policy finishes_public_read on public.acabamentos
  for select to anon, authenticated using (true);
create policy finishes_admin_insert on public.acabamentos
  for insert to authenticated with check (public.is_admin());
create policy finishes_admin_update on public.acabamentos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy finishes_admin_delete on public.acabamentos
  for delete to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('imagens', 'imagens', true)
on conflict (id) do update set public = true;

do $$
declare policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (coalesce(qual, '') ilike '%imagens%' or coalesce(with_check, '') ilike '%imagens%')
  loop
    execute format('drop policy if exists %I on storage.objects', policy_record.policyname);
  end loop;
end $$;

create policy hs_blog_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imagens' and public.is_admin());
create policy hs_blog_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'imagens' and public.is_admin())
  with check (bucket_id = 'imagens' and public.is_admin());
create policy hs_blog_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'imagens' and public.is_admin());

insert into storage.buckets (id, name, public)
values ('arquivos-tecnicos', 'arquivos-tecnicos', false)
on conflict (id) do update set public = false;

drop policy if exists technical_files_read on storage.objects;
drop policy if exists technical_files_insert on storage.objects;
drop policy if exists technical_files_update on storage.objects;
drop policy if exists technical_files_delete on storage.objects;
create policy technical_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'arquivos-tecnicos' and auth.uid() is not null);
create policy technical_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'arquivos-tecnicos' and public.is_admin());
create policy technical_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'arquivos-tecnicos' and public.is_admin())
  with check (bucket_id = 'arquivos-tecnicos' and public.is_admin());
create policy technical_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'arquivos-tecnicos' and public.is_admin());

notify pgrst, 'reload schema';

commit;

-- Depois da migração, vincule a conta administrativa já criada no Auth:
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'SEU_EMAIL_ADMINISTRATIVO';
