const CONTACT_URL = 'https://bio.site/hsmobilia_';

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

export function updateDocumentMeta({ title, description, image }) {
  if (title) document.title = title;
  const values = { description, 'og:title': title, 'og:description': description, 'og:image': image };
  Object.entries(values).forEach(([name, content]) => {
    if (!content) return;
    const attribute = name.startsWith('og:') ? 'property' : 'name';
    let meta = document.head.querySelector(`meta[${attribute}="${name}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute(attribute, name);
      document.head.append(meta);
    }
    meta.setAttribute('content', content);
  });
}

export function renderPublicProducts(container, products = [], options = {}) {
  const { professional = false } = options;
  if (!products.length) {
    container.innerHTML = '<p class="empty-state">Nenhuma peça disponível no acervo no momento.</p>';
    return;
  }

  container.innerHTML = products.map((product) => {
    const id = encodeURIComponent(product.id);
    const name = escapeHTML(product.name || 'Peça sem nome');
    const category = escapeHTML(product.category || '');
    const imageUrl = safeHttpUrl(product.image_url);
    const detailPage = professional ? 'arquiteto-produto.html' : 'produto.html';
    const file3dUrl = professional ? safeHttpUrl(product._file3dUrl) : '';

    return `
      <article class="product-card">
        <a href="./${detailPage}?id=${id}" class="product-card__link">
          <div class="product-card__image-wrapper">
            <img class="product-card__image" src="${escapeHTML(imageUrl)}" alt="${name}" loading="lazy" decoding="async" />
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
