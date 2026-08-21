import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SITE_URL = 'https://felipeheidenblut.github.io/hs-mobilia-final';
const SUPABASE_URL = 'https://kuymrkdcjejhhjtsrnaa.supabase.co';
const SUPABASE_PUBLIC_KEY = process.env.SUPABASE_PUBLIC_KEY || process.env.SUPABASE_ANON_KEY;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

async function request(table, query) {
  if (!SUPABASE_PUBLIC_KEY) return [];
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}` },
  });
  if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
  return response.json();
}

async function loadProducts() {
  try {
    return await request('public_products', 'select=id&order=id.desc');
  } catch {
    return request('products', 'select=id&order=id.desc');
  }
}

const urls = [
  `${SITE_URL}/`,
  `${SITE_URL}/acervo.html`,
  `${SITE_URL}/sobre-nos.html`,
  `${SITE_URL}/blog.html`,
];

if (SUPABASE_PUBLIC_KEY) {
  const [productResult, postResult] = await Promise.allSettled([
    loadProducts(),
    request('blog_posts', 'select=slug&publicado=eq.true&order=created_at.desc'),
  ]);
  const products = productResult.status === 'fulfilled' ? productResult.value : [];
  const posts = postResult.status === 'fulfilled' ? postResult.value : [];
  if (productResult.status === 'rejected') console.warn(`Produtos não incluídos: ${productResult.reason.message}`);
  if (postResult.status === 'rejected') console.warn(`Artigos não incluídos: ${postResult.reason.message}`);
  products.forEach(({ id }) => urls.push(`${SITE_URL}/produto.html?id=${encodeURIComponent(id)}`));
  posts.forEach(({ slug }) => urls.push(`${SITE_URL}/artigo.html?slug=${encodeURIComponent(slug)}`));
} else {
  console.warn('SUPABASE_PUBLIC_KEY não definida; sitemap gerado somente com páginas estáticas.');
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n')}
</urlset>
`;

await writeFile(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
console.log(`sitemap.xml gerado com ${urls.length} URLs.`);
