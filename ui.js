import { SITE_CONFIG } from './config.js';

const CONTACT_URL = 'https://bio.site/hsmobiliacasual';

export function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function safeHttpUrl(value, fallback = '') {
  if (!value) return fallback;
  try {
    const url = new URL(String(value), window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeSearchText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function filterProductsBySearch(products = [], query = '') {
  const tokens = [...new Set(normalizeSearchText(query).split(' ').filter(Boolean))];
  if (!tokens.length) return [...products];

  const ranked = products.map((product, index) => {
    const primaryText = normalizeSearchText([
      product.name,
      product.category,
    ].filter(Boolean).join(' '));
    const secondaryText = normalizeSearchText([
      product.brand,
      product.description,
      product.dimensions,
    ].filter(Boolean).join(' '));
    const matchedTokens = tokens.filter((token) => primaryText.includes(token) || secondaryText.includes(token));
    const score = tokens.reduce((total, token) => {
      if (primaryText.includes(token)) return total + 3;
      if (secondaryText.includes(token)) return total + 1;
      return total;
    }, 0);
    return { product, index, matchedCount: matchedTokens.length, score };
  });
  const completeMatches = ranked.filter(({ matchedCount }) => matchedCount === tokens.length);
  const highestPartialScore = Math.max(0, ...ranked.map(({ score }) => score));
  const matches = completeMatches.length
    ? completeMatches
    : ranked.filter(({ score }) => score > 0 && score === highestPartialScore);
  return matches
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ product }) => product);
}

function productNameParts(product = {}) {
  const name = String(product.name || '').trim();
  const category = String(product.category || '').trim();
  if (!name) return { category, model: '' };

  const normalizedName = normalizeSearchText(name);
  const normalizedCategory = normalizeSearchText(category);
  if (category && (normalizedName === normalizedCategory || normalizedName.startsWith(`${normalizedCategory} `))) {
    return { category, model: name.slice(category.length).trim() };
  }

  if (category) return { category, model: name };
  const [firstWord = '', ...remainingWords] = name.split(/\s+/);
  return { category: firstWord, model: remainingWords.join(' ') };
}

export function getProductDisplayName(product = {}) {
  const { category, model } = productNameParts(product);
  if (!model) return category || 'Peça selecionada';
  const [modelWord] = model.split(/\s+/);
  const abbreviatedModel = [...modelWord].slice(0, 3).join('');
  return [category, abbreviatedModel].filter(Boolean).join(' ');
}

export function getProductDisplayText(value, product = {}) {
  let text = String(value || '');
  const fullName = String(product.name || '').trim();
  const displayName = getProductDisplayName(product);
  const { model } = productNameParts(product);
  const [modelWord = ''] = model.split(/\s+/);
  const abbreviatedModel = [...modelWord].slice(0, 3).join('');
  const escapeRegExp = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const replaceStandalone = (source, word, replacement) => source.replace(
    new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}(?=$|[^\\p{L}\\p{N}])`, 'giu'),
    `$1${replacement}`,
  );

  if (fullName) text = text.replace(new RegExp(escapeRegExp(fullName), 'gi'), displayName);
  if (model.length > abbreviatedModel.length) {
    text = replaceStandalone(text, model, abbreviatedModel);
  }
  if (modelWord.length > abbreviatedModel.length) {
    text = replaceStandalone(text, modelWord, abbreviatedModel);
  }
  return text;
}

export const PRICE_RANGE_STEP = 5;
export const PRICE_RANGE_COUNT = 10;

export function getProductPriceInThousands(product = {}) {
  const priceText = [product.price_from, product.brand]
    .filter((value) => value !== undefined && value !== null)
    .join(' ');
  const match = priceText.match(/(?:a partir de\s*:?\s*)?R\$\s*([\d.,]+)/i);
  if (!match) return null;

  const rawPrice = match[1];
  if (/[.,]/.test(rawPrice)) {
    const valueInReais = Number(rawPrice.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(valueInReais) ? valueInReais / 1000 : null;
  }

  const numericPrice = Number(rawPrice);
  if (!Number.isFinite(numericPrice)) return null;
  return numericPrice <= 200 ? numericPrice : numericPrice / 1000;
}

export function getProductPriceSymbols(product = {}) {
  const priceInThousands = getProductPriceInThousands(product);
  if (priceInThousands === null || isProductPriceAboveRange(product)) return '';
  const range = Math.max(1, Math.ceil(priceInThousands / PRICE_RANGE_STEP));
  return '$'.repeat(range);
}

export function isProductPriceAboveRange(product = {}) {
  const priceInThousands = getProductPriceInThousands(product);
  return priceInThousands !== null && priceInThousands > PRICE_RANGE_STEP * PRICE_RANGE_COUNT;
}

export function getPriceRangeRows(count = PRICE_RANGE_COUNT) {
  return Array.from({ length: count }, (_, index) => {
    const level = index + 1;
    return {
      symbols: '$'.repeat(level),
      range: `${index * PRICE_RANGE_STEP} – ${level * PRICE_RANGE_STEP} mil`,
    };
  });
}

function absoluteSiteUrl(value = '') {
  if (!value) return '';
  try {
    return new URL(value, `${SITE_CONFIG.siteUrl}/`).href;
  } catch {
    return '';
  }
}

function upsertMeta(attribute, name, content) {
  if (!content) return;
  let meta = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, name);
    document.head.append(meta);
  }
  meta.setAttribute('content', content);
}

export function updateDocumentMeta({ title, description, image, canonical, type = 'website' }) {
  if (title) document.title = title;
  const canonicalUrl = absoluteSiteUrl(canonical || window.location.pathname + window.location.search);
  const imageUrl = absoluteSiteUrl(image);

  upsertMeta('name', 'description', description);
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:image', imageUrl);
  upsertMeta('property', 'og:url', canonicalUrl);
  upsertMeta('property', 'og:type', type);
  upsertMeta('property', 'og:locale', 'pt_BR');
  upsertMeta('property', 'og:site_name', SITE_CONFIG.name);
  upsertMeta('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:image', imageUrl);

  if (canonicalUrl) {
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.append(link);
    }
    link.href = canonicalUrl;
  }
}

export function updateStructuredData(id, data) {
  if (!id || !data) return;
  let script = document.getElementById(id);
  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    document.head.append(script);
  }
  script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
}

export function markPageAsNoIndex({ follow = true } = {}) {
  upsertMeta('name', 'robots', follow ? 'noindex,follow' : 'noindex,nofollow');
}

export function renderPublicProducts(container, products = [], options = {}) {
  const { professional = false } = options;
  if (!products.length) {
    container.innerHTML = '<p class="empty-state">Nenhuma peça disponível no acervo no momento.</p>';
    return;
  }

  container.innerHTML = products.map((product) => {
    const id = encodeURIComponent(product.id);
    const name = escapeHTML(getProductDisplayName(product));
    const category = escapeHTML(product.category || '');
    const imageUrl = safeHttpUrl(product.image_url);
    const detailPage = professional ? 'arquiteto-produto.html' : 'produto.html';
    const file3dUrl = professional ? safeHttpUrl(product._file3dUrl) : '';

    return `
      <article class="product-card">
        <a href="./${detailPage}?id=${id}" class="product-card__link">
          <div class="product-card__image-wrapper">
            <img class="product-card__image" src="${escapeHTML(imageUrl)}" alt="${name}" width="1200" height="800" loading="lazy" decoding="async" />
          </div>
          <h3 class="product-card__title">${name}</h3>
          ${category ? `<p class="product-card__meta">${category}</p>` : ''}
        </a>
        ${professional ? `<div class="product-card__downloads">
          <a href="./${detailPage}?id=${id}" class="btn btn-dark">Mais informações</a>
          ${file3dUrl ? `<a href="${escapeHTML(file3dUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-dark">Download 3D</a>` : ''}
        </div>` : ''}
      </article>
    `;
  }).join('');
}

function headerTemplate(variant = 'internal') {
  const internalClass = variant === 'home' ? '' : ' header-interno';
  return `
    <header class="site-header${internalClass}">
      <div class="container header-inner">
        <a href="./index.html" class="brand" aria-label="HS — página inicial">
          <img src="./imagens/logo-nova-transparente.png" alt="HS" class="brand-logo" width="400" height="200">
        </a>
        <button id="mobile-menu-btn" class="mobile-menu-btn" type="button" aria-label="Abrir menu" aria-controls="main-nav" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
        <nav id="main-nav" class="main-nav" aria-label="Navegação principal">
          <a href="./index.html" data-page="index">Início</a>
          <a href="./acervo.html" data-page="acervo">Curadoria</a>
          <a href="./sobre-nos.html" data-page="sobre-nos">Sobre Nós</a>
          <a href="./blog.html" data-page="blog">Blog</a>
          <a href="./arquiteto.html" data-page="arquiteto">Portal do Profissional</a>
          <a href="${CONTACT_URL}" class="btn-nav" target="_blank" rel="noopener noreferrer">Fale conosco</a>
        </nav>
      </div>
    </header>`;
}

function footerTemplate() {
  return `
    <footer class="site-footer">
      <div class="footer-container">
        <div class="footer-col footer-about">
          <h2>HS Mobília • HS Casual</h2>
          <p>Mobiliário com design atemporal e casual que acompanha diferentes formas de viver.</p>
        </div>
        <div class="footer-col">
          <h3 class="footer-title">Explorar</h3>
          <ul class="footer-links">
            <li><a href="./acervo.html">Curadoria</a></li>
            <li><a href="./arquiteto.html">Área do Arquiteto</a></li>
            <li><a href="./sobre-nos.html">Sobre Nós</a></li>
            <li><a href="./blog.html">Blog</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h3 class="footer-title">Contato</h3>
          <p>HS Mobília: Av. Barão do Rio Branco, 1128,<br>Jardim Esplanada.</p>
          <p>HS Casual: Av. São João, 1945,<br>Jardim Esplanada.</p>
          <p><a class="footer-accent-link" href="mailto:leonardo@hsmobilia.com.br">leonardo@hsmobilia.com.br</a></p>
        </div>
        <div class="footer-col">
          <h3 class="footer-title">Redes sociais</h3>
          <ul class="footer-links"><li><a href="https://www.instagram.com/hsmobiliacasual/" target="_blank" rel="noopener noreferrer">Instagram</a></li></ul>
        </div>
      </div>
      <div class="footer-bottom">&copy; 2026 HS e Casual. Design e Permanência.</div>
    </footer>`;
}

function setupMenu() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mainNav = document.getElementById('main-nav');
  if (!menuBtn || !mainNav) return;

  const mobileMedia = window.matchMedia('(max-width: 1024px)');
  let lastFocusedElement = null;

  const focusableElements = () => [
    menuBtn,
    ...mainNav.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  ];

  const setBackgroundInert = (inert) => {
    [...document.body.children]
      .filter((element) => element !== menuBtn.closest('.site-header'))
      .forEach((element) => { element.inert = inert; });
  };

  const setMenuState = (open, restoreFocus = true) => {
    const wasOpen = menuBtn.getAttribute('aria-expanded') === 'true';
    if (open && !mobileMedia.matches) return;
    if (open && !wasOpen) lastFocusedElement = document.activeElement;
    mainNav.classList.toggle('active', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    menuBtn.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    setBackgroundInert(open);
    if (open) mainNav.querySelector('a')?.focus();
    if (!open && wasOpen && restoreFocus && lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus();
    }
  };

  menuBtn.addEventListener('click', () => setMenuState(menuBtn.getAttribute('aria-expanded') !== 'true'));
  mainNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenuState(false, false)));
  mainNav.addEventListener('click', (event) => {
    if (event.target === mainNav) setMenuState(false);
  });

  document.addEventListener('keydown', (event) => {
    const isOpen = menuBtn.getAttribute('aria-expanded') === 'true';
    if (!isOpen) return;

    if (event.key === 'Escape') {
      setMenuState(false);
      return;
    }

    if (event.key === 'Tab') {
      const elements = focusableElements();
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  mobileMedia.addEventListener('change', (event) => {
    if (!event.matches) setMenuState(false, false);
  });
}

function markCurrentPage() {
  const current = document.body.dataset.page;
  if (!current) return;
  document.querySelector(`[data-page="${CSS.escape(current)}"]`)?.setAttribute('aria-current', 'page');
}

function preventWidows() {
  document.querySelectorAll('[data-prevent-widow]').forEach((element) => {
    const textNodes = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const lastNode = textNodes.at(-1);
    if (lastNode) lastNode.textContent = lastNode.textContent.replace(/\s+(\S+)\s*$/, '\u00a0$1');
  });
}

export function initSiteChrome() {
  const headerMount = document.querySelector('[data-site-header]');
  const footerMount = document.querySelector('[data-site-footer]');
  if (headerMount) headerMount.outerHTML = headerTemplate(headerMount.dataset.variant);
  if (footerMount) footerMount.outerHTML = footerTemplate();
  setupMenu();
  markCurrentPage();
  preventWidows();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSiteChrome, { once: true });
} else {
  initSiteChrome();
}
