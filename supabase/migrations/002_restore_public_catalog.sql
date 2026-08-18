-- Correção rápida para bancos em que a tabela products já foi protegida,
-- mas a view public_products ainda não foi criada ou não entrou no cache do PostgREST.

begin;

drop view if exists public.public_products;
create view public.public_products
with (security_invoker = false)
as
select id, name, brand, category, description, image_url, galeria_urls
from public.products;

revoke all on public.public_products from public;
grant select on public.public_products to anon, authenticated;
revoke all on public.products from anon;

notify pgrst, 'reload schema';

commit;
