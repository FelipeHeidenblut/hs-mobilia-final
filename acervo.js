import { fetchPublicProducts } from './supabase.js';
import { filterProductsBySearch, renderPublicProducts } from './ui.js';

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
      const searchVal = searchInput ? searchInput.value.trim() : "";
      
      // Atualiza a lista de produtos filtrados
      const productsInCategory = allProducts.filter((product) => (
        catVal === "" || (product.category && String(product.category).trim() === catVal)
      ));
      currentFilteredProducts = filterProductsBySearch(productsInCategory, searchVal);

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

init();
