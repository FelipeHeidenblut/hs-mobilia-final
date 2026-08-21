import { supabase, getCurrentUser, getArchitectProfile, fetchProfessionalProducts, fetchTexturas, getTechnicalFileUrl } from './supabase.js';
import { escapeHTML, filterProductsBySearch, getPriceRangeRows, renderPublicProducts, safeHttpUrl } from './ui.js';

const elements = {
  feedback: document.getElementById('architect-feedback'),
  auth: document.getElementById('auth-shell'),
  pending: document.getElementById('pending-shell'),
  rejected: document.getElementById('rejected-shell'),
  approved: document.getElementById('approved-shell'),
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  grid: document.getElementById('architect-products'),
  search: document.getElementById('searchInput'),
  category: document.getElementById('categoryFilter'),
  pagination: document.getElementById('pagination-container'),
  summary: document.getElementById('library-summary'),
  libraryTabs: document.querySelectorAll('[data-library-tab]'),
  furniturePanel: document.getElementById('furniture-library-panel'),
  texturesPanel: document.getElementById('textures-library-panel'),
  pricesPanel: document.getElementById('prices-library-panel'),
  priceRanges: document.getElementById('professional-price-ranges'),
  textureMenu: document.getElementById('professional-texture-menu'),
  textureStatus: document.getElementById('professional-textures-status'),
  textureGroups: document.getElementById('professional-texture-groups'),
  texturePagination: document.getElementById('professional-texture-pagination'),
};

let products = [];
let filteredProducts = [];
let textures = [];
let filteredTextures = [];
let currentPage = 1;
let currentTexturePage = 1;
let renderVersion = 0;
let activeLibrary = 'furniture';
let activeTextureMaterial = '';
const ITEMS_PER_PAGE = 9;
const TEXTURES_PER_PAGE = 15;
const HIDDEN_TEXTURE_MATERIALS = new Set(['laca', 'pintura epoxi', 'vidro']);

function showFeedback(message, type = 'info') {
  if (!elements.feedback) return;
  elements.feedback.textContent = message;
  elements.feedback.dataset.type = type;
}

function normalizeInstagram(value) {
  let username = String(value || '').trim();
  if (/^https?:\/\//i.test(username)) {
    try {
      const url = new URL(username);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return '';
      username = url.pathname.split('/').filter(Boolean)[0] || '';
    } catch {
      return '';
    }
  }
  username = username.replace(/^@/, '');
  return /^[a-zA-Z0-9._]{1,30}$/.test(username) ? `@${username}` : '';
}

function showScreen(name) {
  ['auth', 'pending', 'rejected', 'approved'].forEach((screen) => elements[screen]?.classList.add('hidden'));
  elements[name]?.classList.remove('hidden');
  document.body.classList.toggle('is-professional-authenticated', name === 'approved');
}

function populateCategories() {
  if (!elements.category) return;
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort();
  elements.category.replaceChildren(new Option('Todas as Categorias', 'todos'));
  categories.forEach((category) => elements.category.add(new Option(category, category)));
}

function textureMaterial(texture) {
  return String(texture.categoria || 'Outros materiais').trim() || 'Outros materiais';
}

function normalizedTextureMaterial(texture) {
  return textureMaterial(texture)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function textureDisplayName(texture) {
  const material = textureMaterial(texture);
  const nameWithoutNumbers = String(texture.nome || '')
    .replace(/\b\d[\d./_-]*\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return nameWithoutNumbers.localeCompare(material, 'pt-BR', { sensitivity: 'base' }) === 0
    ? ''
    : nameWithoutNumbers;
}

function textureColumnCount(itemCount) {
  if (itemCount <= 5) return Math.max(1, itemCount);
  for (let columns = 5; columns >= 3; columns -= 1) {
    if (itemCount % columns === 0) return columns;
  }
  for (let columns = 5; columns >= 3; columns -= 1) {
    if (itemCount % columns >= 3) return columns;
  }
  return 3;
}

function getTexturePage(totalItems, page) {
  const totalPages = Math.max(1, Math.ceil(totalItems / TEXTURES_PER_PAGE));
  const start = (page - 1) * TEXTURES_PER_PAGE;
  return { start, end: start + TEXTURES_PER_PAGE, totalPages };
}

function renderTexturePagination() {
  if (!elements.texturePagination) return;
  const { totalPages } = getTexturePage(filteredTextures.length, currentTexturePage);
  if (filteredTextures.length <= TEXTURES_PER_PAGE || totalPages <= 1) {
    elements.texturePagination.replaceChildren();
    return;
  }

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'btn-page';
  previous.textContent = 'Anterior';
  previous.disabled = currentTexturePage === 1;
  previous.dataset.texturePage = String(currentTexturePage - 1);

  const status = document.createElement('span');
  status.className = 'page-info';
  status.textContent = `Página ${currentTexturePage} de ${totalPages}`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn-page';
  next.textContent = 'Próxima';
  next.disabled = currentTexturePage === totalPages;
  next.dataset.texturePage = String(currentTexturePage + 1);

  elements.texturePagination.replaceChildren(previous, status, next);
}

function updateLibrarySummary() {
  if (!elements.summary) return;
  if (activeLibrary === 'prices') {
    elements.summary.textContent = 'Consulte as faixas de investimento utilizadas na curadoria.';
    return;
  }
  if (activeLibrary === 'textures') {
    const total = filteredTextures.length;
    elements.summary.textContent = total === 1 ? '1 textura encontrada.' : `${total} texturas encontradas.`;
    return;
  }

  const total = filteredProducts.length;
  elements.summary.textContent = total === 1
    ? '1 peça disponível para especificação.'
    : `${total} peças disponíveis para especificação.`;
}

function setLibraryTab(tabName) {
  activeLibrary = ['furniture', 'textures', 'prices'].includes(tabName) ? tabName : 'furniture';

  elements.libraryTabs.forEach((tab) => {
    const active = tab.dataset.libraryTab === activeLibrary;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  elements.furniturePanel?.classList.toggle('hidden', activeLibrary !== 'furniture');
  elements.texturesPanel?.classList.toggle('hidden', activeLibrary !== 'textures');
  elements.pricesPanel?.classList.toggle('hidden', activeLibrary !== 'prices');
  updateLibrarySummary();
}

function renderPriceGuide() {
  if (!elements.priceRanges) return;
  elements.priceRanges.innerHTML = getPriceRangeRows().map(({ symbols, range }) => `
    <tr>
      <td class="price-guide__symbols">${escapeHTML(symbols)}</td>
      <td>R$ ${escapeHTML(range)}</td>
    </tr>`).join('');
}

function populateTextureMaterials() {
  if (!elements.textureMenu) return;
  const materials = [...new Set(textures.map(textureMaterial))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  activeTextureMaterial = materials.includes(activeTextureMaterial) ? activeTextureMaterial : (materials[0] || '');
  elements.textureMenu.innerHTML = materials.map((material) => {
    const active = material === activeTextureMaterial;
    const count = textures.filter((texture) => textureMaterial(texture) === material).length;
    return `<button type="button" class="${active ? 'is-active' : ''}" data-professional-texture-category="${escapeHTML(material)}" aria-pressed="${active}">${escapeHTML(material)} <span>${count}</span></button>`;
  }).join('');
}

function renderTextureLibrary() {
  if (!elements.textureGroups || !elements.textureStatus) return;
  elements.textureGroups.replaceChildren();
  elements.texturePagination?.replaceChildren();

  if (!filteredTextures.length) {
    elements.textureStatus.textContent = textures.length
      ? 'Nenhuma textura encontrada com esses critérios.'
      : 'Novos acabamentos serão adicionados em breve.';
    return;
  }

  elements.textureStatus.textContent = '';
  const { start, end } = getTexturePage(filteredTextures.length, currentTexturePage);
  const pageTextures = filteredTextures.slice(start, end);
  const groups = new Map();
  pageTextures.forEach((texture) => {
    const material = textureMaterial(texture);
    if (!groups.has(material)) groups.set(material, []);
    groups.get(material).push(texture);
  });

  const markup = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([material, materialTextures]) => {
      const cards = materialTextures
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
        .map((texture) => {
          const displayName = escapeHTML(textureDisplayName(texture));
          const materialName = escapeHTML(textureMaterial(texture));
          const imageUrl = safeHttpUrl(texture.imagem_url);
          const image = imageUrl
            ? `<img src="${escapeHTML(imageUrl)}" alt="Amostra de ${materialName}" width="640" height="640" loading="lazy" decoding="async">`
            : '<span class="texture-card__placeholder">Imagem indisponível</span>';
          const content = `<span class="texture-card__image">${image}</span><span class="texture-card__meta">${displayName ? `<strong>${displayName}</strong>` : ''}${imageUrl ? '<small>Abrir amostra ↗</small>' : ''}</span>`;
          return imageUrl
            ? `<a class="texture-card" href="${escapeHTML(imageUrl)}" target="_blank" rel="noopener noreferrer">${content}</a>`
            : `<article class="texture-card">${content}</article>`;
        }).join('');

      const totalMaterialTextures = filteredTextures.filter((texture) => textureMaterial(texture) === material).length;
      const pageCount = materialTextures.length;
      return `<section class="texture-material-group"><header><h2>${escapeHTML(material)}</h2><span>${totalMaterialTextures} ${totalMaterialTextures === 1 ? 'amostra' : 'amostras'}</span></header><div class="texture-library-grid" data-columns="${textureColumnCount(pageCount)}">${cards}</div></section>`;
    }).join('');

  elements.textureGroups.innerHTML = markup;
  renderTexturePagination();
}

function applyTextureFilters() {
  filteredTextures = textures.filter((texture) => textureMaterial(texture) === activeTextureMaterial);
  currentTexturePage = 1;
  renderTextureLibrary();
  updateLibrarySummary();
}

async function loadTextureLibrary() {
  if (!elements.textureStatus) return;
  elements.textureStatus.textContent = 'Carregando texturas e acabamentos...';
  try {
    const availableTextures = await fetchTexturas() || [];
    textures = availableTextures.filter((texture) => !HIDDEN_TEXTURE_MATERIALS.has(normalizedTextureMaterial(texture)));
    populateTextureMaterials();
    applyTextureFilters();
  } catch (error) {
    console.error('Não foi possível carregar as texturas:', error);
    elements.textureStatus.textContent = 'Não foi possível carregar a biblioteca de texturas.';
  }
}

function renderPagination() {
  if (!elements.pagination) return;
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  if (totalPages <= 1) {
    elements.pagination.replaceChildren();
    return;
  }

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'btn-page';
  previous.textContent = 'Anterior';
  previous.disabled = currentPage === 1;
  previous.dataset.page = String(currentPage - 1);

  const status = document.createElement('span');
  status.className = 'page-info';
  status.textContent = `Página ${currentPage} de ${totalPages}`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn-page';
  next.textContent = 'Próxima';
  next.disabled = currentPage === totalPages;
  next.dataset.page = String(currentPage + 1);

  elements.pagination.replaceChildren(previous, status, next);
}

async function renderPage() {
  const version = ++renderVersion;
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageProducts = filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  const productsWithLinks = await Promise.all(pageProducts.map(async (product) => {
    if (!product.file_3d_url) return product;
    try {
      return { ...product, _file3dUrl: await getTechnicalFileUrl(product.file_3d_url) };
    } catch (error) {
      console.error('Não foi possível gerar o link 3D:', error);
      return product;
    }
  }));

  if (version !== renderVersion) return;
  renderPublicProducts(elements.grid, productsWithLinks, { professional: true });
  renderPagination();
}

function applyFilters() {
  const search = elements.search?.value.trim() || '';
  const category = elements.category?.value || 'todos';
  const productsInCategory = products.filter((product) => category === 'todos' || product.category === category);
  filteredProducts = filterProductsBySearch(productsInCategory, search);
  currentPage = 1;
  renderPage();
  updateLibrarySummary();
}

async function loadLibrary() {
  try {
    showFeedback('Carregando a Curadoria HS...', 'info');
    products = await fetchProfessionalProducts();
    filteredProducts = [...products];
    populateCategories();
    updateLibrarySummary();
    await renderPage();
    if (products.some((product) => product._limitedAccess)) {
      showFeedback('Curadoria carregada. Os downloads técnicos aguardam a atualização de acesso no Supabase.', 'info');
    } else {
      showFeedback('', 'info');
    }
  } catch (error) {
    console.error(error);
    showFeedback('Não foi possível carregar a biblioteca técnica.', 'error');
  }
  await loadTextureLibrary();
}

async function checkSession() {
  const user = await getCurrentUser();
  if (!user) {
    showScreen('auth');
    return false;
  }

  const profile = await getArchitectProfile();
  if (!profile) {
    showScreen('rejected');
    showFeedback('Não foi possível localizar seu cadastro profissional.', 'error');
    return false;
  }

  if (profile.status === 'pending') {
    showScreen('pending');
    showFeedback('Seu cadastro ainda está aguardando a aprovação da HS.', 'info');
    return false;
  }

  if (profile.status !== 'approved') {
    showScreen('rejected');
    showFeedback('Este cadastro não possui acesso à área profissional.', 'error');
    return false;
  }

  showScreen('approved');
  showFeedback('', 'info');
  await loadLibrary();
  return true;
}

elements.registerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.registerForm);
  const registryType = String(formData.get('registry_type') || '').toUpperCase();
  const registryNumber = String(formData.get('registry_number') || '').trim().toUpperCase();
  const instagram = normalizeInstagram(formData.get('instagram'));

  if (!['CAU', 'ABD'].includes(registryType) || !/^[A-Z0-9./-]{4,30}$/.test(registryNumber)) {
    showFeedback('Informe um registro CAU ou ABD válido.', 'error');
    return;
  }
  if (!instagram) {
    showFeedback('Informe um perfil válido do Instagram, como @seuperfil.', 'error');
    return;
  }

  showFeedback('Criando sua conta...', 'info');
  const { data, error } = await supabase.auth.signUp({
    email: formData.get('email'),
    password: formData.get('password'),
    options: {
      data: {
        full_name: String(formData.get('full_name') || '').trim(),
        account_type: 'architect',
        registry_type: registryType,
        registry_number: registryNumber,
        instagram,
      },
    },
  });

  if (error) {
    showFeedback(error.message === 'User already registered' ? 'Este e-mail já está cadastrado.' : 'Não foi possível criar a conta.', 'error');
    return;
  }

  elements.registerForm.reset();
  if (data.session) {
    showFeedback('Cadastro recebido. Seus dados serão analisados pela HS.', 'success');
    await checkSession();
  } else {
    showFeedback('Cadastro recebido. Confirme seu e-mail; o acesso será liberado após a análise da HS.', 'success');
  }
});

elements.loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.loginForm);
  showFeedback('Verificando credenciais...', 'info');

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.get('email'),
      password: formData.get('password'),
    });
    if (error) {
      showFeedback(error.message === 'Email not confirmed'
        ? 'Confirme seu e-mail antes de entrar.'
        : 'E-mail ou senha inválidos.', 'error');
      return;
    }

    elements.loginForm.reset();
    showFeedback('Credenciais confirmadas. Validando seu cadastro...', 'info');
    const authenticated = await checkSession();
    if (!authenticated && !document.getElementById('pending-shell')?.classList.contains('hidden')) {
      showFeedback('Seu cadastro ainda está aguardando a aprovação da HS.', 'info');
    }
  } catch (error) {
    console.error(error);
    showFeedback('Não foi possível conectar ao portal. Tente novamente.', 'error');
  }
});

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const loginActive = tab.dataset.authTab === 'login';
    document.querySelectorAll('.auth-tab').forEach((item) => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
    elements.loginForm?.classList.toggle('hidden', !loginActive);
    elements.registerForm?.classList.toggle('hidden', loginActive);
    (loginActive ? elements.loginForm : elements.registerForm)?.querySelector('input')?.focus();
  });
});

elements.search?.addEventListener('input', applyFilters);
elements.category?.addEventListener('change', applyFilters);
elements.textureMenu?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-professional-texture-category]');
  if (!button) return;
  activeTextureMaterial = button.dataset.professionalTextureCategory;
  elements.textureMenu.querySelectorAll('button').forEach((item) => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  applyTextureFilters();
});
elements.texturePagination?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-texture-page]');
  if (!button || button.disabled) return;
  currentTexturePage = Number(button.dataset.texturePage);
  renderTextureLibrary();
  elements.texturesPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
elements.libraryTabs.forEach((tab) => tab.addEventListener('click', () => setLibraryTab(tab.dataset.libraryTab)));
elements.libraryTabs.forEach((tab, index) => tab.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  const targetIndex = (index + direction + elements.libraryTabs.length) % elements.libraryTabs.length;
  const target = elements.libraryTabs[targetIndex];
  setLibraryTab(target.dataset.libraryTab);
  target.focus();
}));
elements.pagination?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-page]');
  if (!button || button.disabled) return;
  currentPage = Number(button.dataset.page);
  renderPage();
  document.getElementById('approved-shell')?.scrollIntoView({ behavior: 'smooth' });
});

document.querySelectorAll('#signout-pending, #signout-rejected, #signout-approved').forEach((button) => {
  button.addEventListener('click', async () => {
    await supabase.auth.signOut();
    products = [];
    textures = [];
    showScreen('auth');
  });
});

renderPriceGuide();
checkSession();

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') showScreen('auth');
});
