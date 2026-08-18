import { fetchPublicProducts, fetchTexturas } from './supabase.js';
import { renderPublicProducts } from './ui.js';
import { escapeHTML, safeHttpUrl } from './ui.js';

let allProducts = [];
let currentFilteredProducts = []; // Guarda os produtos APÓS o filtro
let currentPage = 1;
const itemsPerPage = 6;

async function init() {
  console.log("🔍 1. Script acervo.js iniciado (Agora com paginação)!");

  try {
    const statusEl = document.getElementById('public-status');
    const gridEl = document.getElementById('public-products');
    const categorySelect = document.getElementById('filter-category');
    const searchInput = document.getElementById('search-input');
    const paginationContainer = document.getElementById('pagination-container'); // Nosso container de botões

    if (statusEl) statusEl.textContent = 'Carregando acervo...';
    
    allProducts = await fetchPublicProducts();

    if (!allProducts || allProducts.length === 0) {
        if (statusEl) statusEl.textContent = 'O acervo está vazio no momento.';
        return;
    }

    if (statusEl) statusEl.textContent = '';
    
    // Inicialmente, a lista filtrada é a lista completa
    currentFilteredProducts = [...allProducts];
    
    if (categorySelect) {
      const categories = [...new Set(allProducts.map(p => p.category ? String(p.category).trim() : "").filter(Boolean))].sort();
      categorySelect.innerHTML = '<option value="">Todas as Categorias</option>';
      categories.forEach(cat => categorySelect.add(new Option(cat, cat)));
    } else {
      console.error("❌ ERRO: <select id='filter-category'> não encontrado no HTML");
    }

    // --- LÓGICA DE PAGINAÇÃO E RENDERIZAÇÃO ---
    function renderPage() {
      if (!gridEl) return;

      // Se a busca/filtro não retornar nada
      if (currentFilteredProducts.length === 0) {
        gridEl.innerHTML = '<p style="text-align:center; grid-column: 1/-1; margin-top: 3rem; color: var(--color-text-light);">Nenhuma peça encontrada com estes critérios.</p>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
      }

      // Calcula o recorte
      const start = (currentPage - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const productsToDisplay = currentFilteredProducts.slice(start, end);

      // Manda a SUA função do ui.js desenhar os 6 móveis da vez!
      renderPublicProducts(gridEl, productsToDisplay);

      // Chama a renderização dos botões
      renderPaginationButtons();
    }

    function renderPaginationButtons() {
      if (!paginationContainer) return;

      const totalPages = Math.ceil(currentFilteredProducts.length / itemsPerPage);
      
      if (totalPages <= 1) {
        paginationContainer.innerHTML = ''; 
        return;
      }

      let botoesHTML = '';

      // Botão Anterior
      botoesHTML += `<button data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>`;

      // --- LÓGICA DE JANELA DESLIZANTE (MAX 5 BOTÕES VISÍVEIS) ---
      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(totalPages, currentPage + 2);

      if (currentPage <= 2) {
        endPage = Math.min(totalPages, 5);
      }
      if (currentPage >= totalPages - 1) {
        startPage = Math.max(1, totalPages - 4);
      }

      // Adiciona o botão da Página 1 e os "..." no início, se necessário
      if (startPage > 1) {
        botoesHTML += `<button data-page="1">1</button>`;
        if (startPage > 2) {
           botoesHTML += `<span style="padding: 0 0.5rem; color: var(--color-text-light);">...</span>`;
        }
      }

      // Números das Páginas Centrais
      for (let i = startPage; i <= endPage; i++) {
        botoesHTML += `<button data-page="${i}" class="${i === currentPage ? 'active' : ''}">${i}</button>`;
      }

      // Adiciona os "..." e a Última Página, se necessário
      if (endPage < totalPages) {
         if (endPage < totalPages - 1) {
            botoesHTML += `<span style="padding: 0 0.5rem; color: var(--color-text-light);">...</span>`;
         }
         botoesHTML += `<button data-page="${totalPages}">${totalPages}</button>`;
      }
      // -------------------------------------------------------------

      // Botão Próxima
      botoesHTML += `<button data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Próxima</button>`;

      paginationContainer.innerHTML = botoesHTML;
    }

    // --- LÓGICA DE FILTRO ATUALIZADA ---
    function applyFilters() {
      const catVal = categorySelect ? categorySelect.value : "";
      const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : "";
      
      // Atualiza a lista de produtos filtrados
      currentFilteredProducts = allProducts.filter(product => {
        const matchCat = catVal === "" || (product.category && String(product.category).trim() === catVal);
        const matchSearch = searchVal === "" || (product.name && String(product.name).toLowerCase().includes(searchVal));
        return matchCat && matchSearch;
      });

      // Toda vez que filtra, volta para a página 1 para não dar bug
      currentPage = 1;
      
      // Manda desenhar a nova página filtrada
      renderPage();
    }

    // --- EVENT LISTENERS ---
    
    // Ouve os cliques nos botões de paginação
    if (paginationContainer) {
      paginationContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && !e.target.disabled) {
          currentPage = parseInt(e.target.dataset.page);
          renderPage();
          window.scrollTo({ top: 0, behavior: 'smooth' }); // Rola suavemente pro topo
        }
      });
    }

    // Ouve os filtros de busca e categoria
    if (categorySelect) categorySelect.addEventListener('change', applyFilters);
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    
    // 1ª Renderização ao abrir a página
    renderPage();

  } catch (error) {
    console.error("❌ ERRO FATAL:", error);
    const statusEl = document.getElementById('public-status');
    if (statusEl) statusEl.textContent = 'Não foi possível carregar o acervo. Tente novamente em alguns instantes.';
  }

}

async function carregarTexturas() {
  const gridTexturas = document.getElementById('textures-grid');
  const categoryMenu = document.getElementById('texture-category-menu');
  const pagination = document.getElementById('texture-pagination');

  if (!gridTexturas) return;

  try {
    const texturas = await fetchTexturas() || [];

    if (!texturas.length) {
      gridTexturas.innerHTML = '<p class="textures-empty">Novos acabamentos serão adicionados em breve.</p>';
      return;
    }

    const itemsPerPage = 15;
    let activeCategory = '';
    let currentTexturePage = 1;
    let filteredTextures = [...texturas];
    const textureCategory = (texture) => String(texture.categoria || 'Outros materiais').trim() || 'Outros materiais';
    const categories = [...new Set(texturas.map(textureCategory))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    function getBalancedPage(totalItems, page) {
      const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
      const baseSize = Math.floor(totalItems / totalPages);
      const largerPages = totalItems % totalPages;
      const pageSize = baseSize + (page <= largerPages ? 1 : 0);
      const start = (page - 1) * baseSize + Math.min(page - 1, largerPages);
      return { start, end: start + pageSize, totalPages };
    }

    function getBalancedColumnCount(itemCount) {
      if (itemCount <= 5) return Math.max(1, itemCount);
      for (let columns = 5; columns >= 3; columns -= 1) {
        if (itemCount % columns === 0) return columns;
      }
      for (let columns = 5; columns >= 3; columns -= 1) {
        if (itemCount % columns >= 3) return columns;
      }
      return 3;
    }

    function renderCategoryMenu() {
      if (!categoryMenu) return;
      const buttons = [
        `<button type="button" class="is-active" data-texture-category="" aria-pressed="true">Todas <span>${texturas.length}</span></button>`,
        ...categories.map((category) => {
          const count = texturas.filter((texture) => textureCategory(texture) === category).length;
          return `<button type="button" data-texture-category="${escapeHTML(category)}" aria-pressed="false">${escapeHTML(category)} <span>${count}</span></button>`;
        }),
      ];
      categoryMenu.innerHTML = buttons.join('');
    }

    function renderTexturePagination() {
      if (!pagination) return;
      const { totalPages } = getBalancedPage(filteredTextures.length, currentTexturePage);
      if (totalPages <= 1) {
        pagination.replaceChildren();
        return;
      }

      let startPage = Math.max(1, currentTexturePage - 2);
      let endPage = Math.min(totalPages, currentTexturePage + 2);
      if (currentTexturePage <= 2) endPage = Math.min(totalPages, 5);
      if (currentTexturePage >= totalPages - 1) startPage = Math.max(1, totalPages - 4);

      let markup = `<button type="button" data-texture-page="${currentTexturePage - 1}" ${currentTexturePage === 1 ? 'disabled' : ''}>Anterior</button>`;
      for (let page = startPage; page <= endPage; page += 1) {
        markup += `<button type="button" data-texture-page="${page}" class="${page === currentTexturePage ? 'active' : ''}" ${page === currentTexturePage ? 'aria-current="page"' : ''}>${page}</button>`;
      }
      markup += `<button type="button" data-texture-page="${currentTexturePage + 1}" ${currentTexturePage === totalPages ? 'disabled' : ''}>Próxima</button>`;
      pagination.innerHTML = markup;
    }

    function renderTexturePage() {
      if (!filteredTextures.length) {
        gridTexturas.innerHTML = '<p class="textures-empty">Nenhuma textura encontrada nesta categoria.</p>';
        pagination?.replaceChildren();
        return;
      }

      const { start, end } = getBalancedPage(filteredTextures.length, currentTexturePage);
      const pageTextures = filteredTextures.slice(start, end);
      gridTexturas.dataset.columns = String(getBalancedColumnCount(pageTextures.length));
      gridTexturas.innerHTML = pageTextures.map((texture) => `
        <article class="texture-item">
          <img src="${escapeHTML(safeHttpUrl(texture.imagem_url))}" alt="Amostra ${escapeHTML(texture.nome)}" class="texture-swatch" loading="lazy" decoding="async">
          <div class="texture-meta">
            <div class="texture-category">${escapeHTML(textureCategory(texture))}</div>
            <div class="texture-name">${escapeHTML(texture.nome)}</div>
          </div>
        </article>
      `).join('');
      renderTexturePagination();
    }

    categoryMenu?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-texture-category]');
      if (!button) return;
      activeCategory = button.dataset.textureCategory;
      filteredTextures = activeCategory
        ? texturas.filter((texture) => textureCategory(texture) === activeCategory)
        : [...texturas];
      currentTexturePage = 1;
      categoryMenu.querySelectorAll('button').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      renderTexturePage();
    });

    pagination?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-texture-page]');
      if (!button || button.disabled) return;
      currentTexturePage = Number(button.dataset.texturePage);
      renderTexturePage();
      document.querySelector('.materiality-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    renderCategoryMenu();
    renderTexturePage();

  } catch (error) {
    console.error("❌ Erro ao desenhar texturas:", error);
    gridTexturas.innerHTML = '<p class="textures-empty">Erro ao carregar os acabamentos.</p>';
  }
}

init();
carregarTexturas();
