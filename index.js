import { fetchPublicProducts, formatError } from './supabase.js';
import { renderPublicProducts, setFeedback, setupThemeToggle } from './ui.js';

const statusEl = document.getElementById('public-status');
const gridEl = document.getElementById('public-products');

async function init() {
  setupThemeToggle();

  try {
    const products = await fetchPublicProducts();
    renderPublicProducts(gridEl, products);
    setFeedback(statusEl, `${products.length} produto(s) carregado(s).`, 'success');
  } catch (error) {
    setFeedback(statusEl, formatError(error), 'error');
  }
}

init();