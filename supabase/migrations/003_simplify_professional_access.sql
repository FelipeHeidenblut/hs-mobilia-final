-- O acesso profissional não depende mais de aprovação manual.
-- Qualquer usuário autenticado pode consultar produtos e arquivos técnicos.

begin;

grant select on public.products to authenticated;

drop policy if exists products_professional_read on public.products;
create policy products_professional_read on public.products
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists technical_files_read on storage.objects;
create policy technical_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'arquivos-tecnicos' and auth.uid() is not null);

update public.architects set status = 'approved' where status = 'pending';

update public.architects as architect
set user_id = auth_user.id,
    status = 'approved'
from auth.users as auth_user
where architect.user_id is null
  and lower(architect.email) = lower(auth_user.email);

notify pgrst, 'reload schema';

commit;
