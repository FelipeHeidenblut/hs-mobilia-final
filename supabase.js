import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://kuymrkdcjejhhjtsrnaa.supabase.co';
const SUPABASE_PUBLIC_KEY = 'sb_publishable_DI14vjzPrK7piFyZj_DEZQ_eC0gkOse';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const PUBLIC_PRODUCT_FIELDS = 'id,name,brand,category,description,image_url,galeria_urls';
const PUBLIC_POST_FIELDS = 'id,titulo,slug,imagem_capa,autor,created_at';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

function isMissingPublicProductsView(error) {
  return error?.code === 'PGRST205'
    || (error?.code === '42P01' && String(error.message).includes('public_products'));
}

async function queryPublicProducts(buildQuery) {
  const viewResult = await buildQuery('public_products');
  if (!viewResult.error) return viewResult.data;
  if (!isMissingPublicProductsView(viewResult.error)) throw viewResult.error;

  console.warn('A view public_products ainda não existe; usando products temporariamente. Aplique a migration do Supabase.');
  return unwrap(await buildQuery('products'));
}

export async function fetchPublicProducts({ from = 0, to = 999 } = {}) {
  return queryPublicProducts((source) => supabase
    .from(source)
    .select(PUBLIC_PRODUCT_FIELDS)
    .order('id', { ascending: false })
    .range(from, to));
}

export async function fetchPublicProductById(id) {
  return queryPublicProducts((source) => supabase
    .from(source)
    .select(PUBLIC_PRODUCT_FIELDS)
    .eq('id', id)
    .single());
}

export async function fetchRelatedProducts(category, currentProductId) {
  return queryPublicProducts((source) => supabase
    .from(source)
    .select('id,name,category,image_url')
    .eq('category', category)
    .neq('id', currentProductId)
    .limit(4));
}

export async function fetchProfessionalProducts() {
  const result = await supabase.from('products').select('*').order('id', { ascending: false });
  if (!result.error && result.data?.length) return result.data;

  if (result.error) console.warn('Acesso técnico aos produtos indisponível; carregando catálogo público.', result.error.code);
  const publicProducts = await queryPublicProducts((source) => supabase
    .from(source)
    .select(PUBLIC_PRODUCT_FIELDS)
    .order('id', { ascending: false })
    .range(0, 999));
  return publicProducts.map((product) => ({ ...product, _limitedAccess: true }));
}

export async function fetchProfessionalProductById(id) {
  const result = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (!result.error && result.data) return result.data;

  if (result.error) console.warn('Detalhes técnicos indisponíveis; carregando dados públicos.', result.error.code);
  const product = await queryPublicProducts((source) => supabase
    .from(source)
    .select(PUBLIC_PRODUCT_FIELDS)
    .eq('id', id)
    .single());
  return { ...product, _limitedAccess: true };
}

export async function fetchTexturas() {
  return unwrap(await supabase
    .from('acabamentos')
    .select('id,categoria,nome,imagem_url')
    .order('categoria')
    .order('nome'));
}

export async function fetchBlogPosts() {
  return unwrap(await supabase
    .from('blog_posts')
    .select(PUBLIC_POST_FIELDS)
    .eq('publicado', true)
    .order('created_at', { ascending: false }));
}

export async function fetchPostBySlug(slug) {
  return unwrap(await supabase
    .from('blog_posts')
    .select('id,titulo,slug,imagem_capa,autor,conteudo,created_at')
    .eq('slug', slug)
    .eq('publicado', true)
    .single());
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function getArchitectProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('architects')
    .select('id,user_id,full_name,email,status,registry_type,registry_number,instagram')
    .eq('user_id', user.id)
    .single();
  if (error) return null;
  return data;
}

export async function isCurrentUserAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;
  const { data, error } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  return !error && Boolean(data);
}

export async function getTechnicalFileUrl(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const { data, error } = await supabase.storage.from('arquivos-tecnicos').createSignedUrl(value, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadAiProjectAsset(path, file) {
  const { error } = await supabase.storage
    .from('ai-projects')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (error) throw error;

  return path;
}

export async function removeAiProjectAssets(paths) {
  const safePaths = (paths || []).filter(Boolean);
  if (!safePaths.length) return;

  const { error } = await supabase.storage
    .from('ai-projects')
    .remove(safePaths);

  if (error) throw error;
}

export async function generateRoomPreview(payload) {
  const { data, error } = await supabase.functions.invoke(
    'generate-room-preview',
    { body: payload },
  );

  if (!error) return data;

  let message = error.message
    || 'Não foi possível chamar o gerador.';
  let code = 'FUNCTION_REQUEST_FAILED';
  let status = 0;

  if (error.context instanceof Response) {
    status = error.context.status;

    try {
      const details = await error.context.clone().json();
      message = details?.error || message;
      code = details?.code || code;
    } catch {
      // Mantém a mensagem original quando a resposta não contém JSON.
    }
  }

  const functionError = new Error(message);
  functionError.code = code;
  functionError.status = status;
  throw functionError;
}
