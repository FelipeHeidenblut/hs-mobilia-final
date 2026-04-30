import { supabase } from './supabase.js';

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');

  const statusEl = document.getElementById('loading-status');
  const detailView = document.getElementById('product-detail-view');

  if (!productId) {
    statusEl.textContent = 'Nenhuma peça especificada.';
    statusEl.style.color = '#d9534f';
    return;
  }

  // Busca o produto pelo ID
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (error || !product) {
    statusEl.textContent = 'Peça não encontrada no acervo.';
    statusEl.style.color = '#d9534f';
    return;
  }

  // Oculta aviso de carregamento e exibe o grid
  statusEl.classList.add('hidden');
  detailView.classList.remove('hidden');
  
  // Como usamos um grid com "gap", o hidden do CSS precisa garantir que ele não quebre o display: grid
  detailView.style.display = 'grid'; 

  // Preenche os dados
  document.getElementById('detail-image').src = product.image_url;
  document.getElementById('detail-image').alt = product.name;
  document.getElementById('detail-category').textContent = product.category || 'Acervo';
  document.getElementById('detail-name').textContent = product.name;
  document.getElementById('detail-brand').textContent = product.brand;
  document.getElementById('detail-dimensions').textContent = product.dimensions || 'Sob consulta';
  
  if (product.description) {
    document.getElementById('detail-description').textContent = product.description;
  }
}

document.addEventListener('DOMContentLoaded', init);