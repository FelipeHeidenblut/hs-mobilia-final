import { fetchPublicProducts, formatError } from 'supabase.js';
import { renderPublicProducts, setFeedback, setupThemeToggle } from 'ui.js';

const statusEl = document.getElementById('public-status');
const gridEl = document.getElementById('public-products');

// Elementos dos Filtros
const categorySelect = document.getElementById('filter-category');
const brandSelect = document.getElementById('filter-brand');
const searchInput = document.getElementById('search-input');

// Variável global para guardar os produtos e filtrar sem precisar chamar o banco de novo
let allProducts = [];

async function init() {
  if (typeof setupThemeToggle === 'function') setupThemeToggle();

  try {
    // 1. Busca os dados no Supabase
    allProducts = await fetchPublicProducts();
    
    // 2. Monta as opções de filtro e mostra tudo
    populateFilters(allProducts);
    renderPublicProducts(gridEl, allProducts);
    setFeedback(statusEl, '', 'success'); // Limpa a mensagem de carregando
    
    // 3. Liga os eventos de filtro
    setupFilterListeners();
    
  } catch (error) {
    setFeedback(statusEl, formatError(error), 'error');
  }
}

// Extrai as categorias e marcas do banco e cria as opções do select
function populateFilters(products) {
  // Pega valores únicos e coloca em ordem alfabética
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();

  categories.forEach(cat => {
    categorySelect.add(new Option(cat, cat));
  });

  brands.forEach(brand => {
    brandSelect.add(new Option(brand, brand));
  });
}

// Filtra a lista de produtos baseada no que o usuário escolheu
function applyFilters() {
  const catVal = categorySelect.value;
  const brandVal = brandSelect.value;
  const searchVal = searchInput.value.toLowerCase().trim();

  const filteredProducts = allProducts.filter(product => {
    // Verifica a Categoria
    const matchCat = catVal === "" || product.category === catVal;
    
    // Verifica a Marca
    const matchBrand = brandVal === "" || product.brand === brandVal;
    
    // Verifica o texto de Busca (olha no nome da peça)
    const matchSearch = searchVal === "" || product.name.toLowerCase().includes(searchVal);

    return matchCat && matchBrand && matchSearch;
  });

  // Mostra na tela só quem passou no filtro
  renderPublicProducts(gridEl, filteredProducts);
  
  // Aviso amigável caso o filtro seja muito específico e não ache nada
  if (filteredProducts.length === 0) {
    gridEl.innerHTML = '<p style="text-align:center; grid-column: 1/-1; color: var(--color-text-light);">Nenhuma peça encontrada com estes critérios.</p>';
  }
}

// Ativa a função de filtro sempre que algo mudar
function setupFilterListeners() {
  categorySelect.addEventListener('change', applyFilters);
  brandSelect.addEventListener('change', applyFilters);
  searchInput.addEventListener('input', applyFilters);
}

// Inicia tudo
init();
