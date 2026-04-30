export function setupThemeToggle() {
  const root = document.documentElement;
  const toggle = document.querySelector('[data-theme-toggle]');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');

  if (!toggle) return;

  toggle.addEventListener('click', () => {
    const current = root.getAttribute('data-theme');
    root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  });
}

export function setFeedback(element, message, type = 'info') {
  if (!element) return;
  element.className = `feedback ${type}`;
  element.textContent = message;
}

export function show(element) {
  element?.classList.remove('hidden');
}

export function hide(element) {
  element?.classList.add('hidden');
}

export function renderEmptyState(container, message) {
  container.innerHTML = `<div class="empty-state">${message}</div>`;
}

export function renderPublicProducts(container, products = []) {
  if (!products.length) {
    container.innerHTML = '<p style="text-align:center; grid-column: 1/-1; color: var(--color-text-light);">Nenhuma peça disponível no acervo no momento.</p>';
    return;
  }

  container.innerHTML = products.map(product => `
    <a href="./produto.html?id=${product.id}" class="product-card">
      <div class="product-card__image-wrapper">
        <img
          class="product-card__image"
          src="${product.image_url}"
          alt="${product.name}"
          loading="lazy"
        />
      </div>
      <h3 class="product-card__title">${product.name}</h3>
      <p class="product-card__meta">${product.brand}</p>
    </a>
  `).join('');
}

export function renderArchitectProducts(container, products = []) {
  if (!products.length) {
    renderEmptyState(container, 'Nenhum produto disponível para download.');
    return;
  }

  container.innerHTML = products.map(product => `
    <article class="product-card">
      <img
        class="product-card__image"
        src="${product.image_url}"
        alt="${product.name}"
        loading="lazy"
      />
      <div class="product-card__body">
        <div>
          <h3 class="product-card__title">${product.name}</h3>
          <p class="product-card__meta">${product.brand}</p>
        </div>

        <p class="product-card__meta">${product.dimensions || 'Dimensões sob consulta'}</p>

        <div class="product-card__downloads">
          ${product.file_2d_url ? `<a class="btn btn-secondary" href="${product.file_2d_url}" target="_blank" rel="noopener noreferrer">Download 2D</a>` : ''}
          ${product.file_3d_url ? `<a class="btn btn-secondary" href="${product.file_3d_url}" target="_blank" rel="noopener noreferrer">Download 3D</a>` : ''}
        </div>
      </div>
    </article>
  `).join('');
}

export function statusBadge(status) {
  const map = {
    pending: { label: 'Pendente', className: 'pending' },
    approved: { label: 'Aprovado', className: 'approved' },
    rejected: { label: 'Rejeitado', className: 'rejected' }
  };

  const current = map[status] || map.pending;
  return `<span class="status-badge ${current.className}">${current.label}</span>`;
}