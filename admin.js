// Importe o seu cliente Supabase (ajuste o caminho se necessário)
import { supabase } from './supabase.js';

// --- ELEMENTOS DA INTERFACE ---
const feedbackEl = document.getElementById('admin-feedback');
const productForm = document.getElementById('product-form');
const csvForm = document.getElementById('csv-form');
const productsTable = document.getElementById('admin-products-table');
const architectsTable = document.getElementById('architects-table');

// --- FUNÇÃO DE FEEDBACK (AVISOS NA TELA) ---
function showFeedback(message, type = 'info') {
  feedbackEl.textContent = message;
  // Ajusta as cores para o novo padrão de alto padrão
  if (type === 'error') feedbackEl.style.color = '#d9534f';
  else if (type === 'success') feedbackEl.style.color = '#4a5d4e';
  else feedbackEl.style.color = 'var(--color-accent)';
  
  // Limpa o aviso após 5 segundos
  setTimeout(() => { feedbackEl.textContent = ''; }, 5000);
}

// ==========================================
// GESTÃO DO ACERVO (PRODUTOS)
// ==========================================

// 1. Carregar produtos na tabela
async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    showFeedback('Erro ao carregar o acervo.', 'error');
    return;
  }

  productsTable.innerHTML = data.map(product => `
    <tr>
      <td>
        <div style="display: flex; align-items: center; gap: 1rem;">
          <img src="${product.image_url}" alt="Foto" style="width: 40px; height: 40px; object-fit: cover; border-radius: 50%; background: #f0f0f0;">
          <strong>${product.name}</strong>
        </div>
      </td>
      <td>${product.brand}</td>
      <td>${product.category || '-'}</td>
      <td>${product.dimensions || '-'}</td>
      <td>
        <button class="btn" onclick="deleteProduct(${product.id})" style="color: #d9534f; border-color: #d9534f;">Excluir</button>
      </td>
    </tr>
  `).join('');
}

// 2. Excluir produto (colocamos no window para o onclick funcionar no HTML injetado)
window.deleteProduct = async (id) => {
  if (!confirm('Tem certeza que deseja remover esta peça do acervo?')) return;
  
  const { error } = await supabase.from('products').delete().eq('id', id);
  
  if (error) {
    showFeedback('Erro ao excluir peça.', 'error');
  } else {
    showFeedback('Peça removida com sucesso.', 'success');
    loadProducts(); // Recarrega a tabela
  }
};

// 3. Cadastrar produto manualmente
productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showFeedback('Salvando peça...', 'info');

  const formData = new FormData(productForm);
  const newProduct = Object.fromEntries(formData.entries());

  // Limpa os campos vazios para evitar envio de strings em branco
  Object.keys(newProduct).forEach(key => {
    if (!newProduct[key]) delete newProduct[key];
  });

  const { error } = await supabase.from('products').insert([newProduct]);

  if (error) {
    showFeedback('Erro ao salvar no acervo.', 'error');
    console.error(error);
  } else {
    showFeedback('Peça adicionada com sucesso!', 'success');
    productForm.reset();
    loadProducts();
  }
});

// 4. Importar lote via CSV (PapaParse)
csvForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('csv-file');
  const file = fileInput.files[0];
  
  if (!file) return;

  showFeedback('Processando arquivo CSV...', 'info');

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      // results.data contém um array de objetos com os produtos
      const { error } = await supabase.from('products').insert(results.data);
      
      if (error) {
        showFeedback('Erro ao importar CSV. Verifique os cabeçalhos.', 'error');
        console.error(error);
      } else {
        showFeedback(`${results.data.length} peças importadas com sucesso!`, 'success');
        csvForm.reset();
        loadProducts();
      }
    }
  });
});

// ==========================================
// CURADORIA DE PROFISSIONAIS (ARQUITETOS)
// ==========================================

// 1. Carregar arquitetos na tabela
async function loadArchitects() {
  const { data, error } = await supabase
    .from('architects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    showFeedback('Erro ao carregar lista de profissionais.', 'error');
    return;
  }

  architectsTable.innerHTML = data.map(arch => `
    <tr>
      <td><strong>${arch.full_name}</strong></td>
      <td>${arch.email}</td>
      <td>
        <span class="status-badge ${arch.status}">
          ${arch.status === 'pending' ? 'Em Análise' : arch.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
        </span>
      </td>
      <td>
        ${arch.status === 'pending' ? `
          <button class="btn" onclick="updateArchitectStatus('${arch.id}', 'approved')" style="color: #4a5d4e; border-color: #4a5d4e;">Aprovar</button>
          <button class="btn" onclick="updateArchitectStatus('${arch.id}', 'rejected')" style="color: #d9534f; border-color: #d9534f;">Rejeitar</button>
        ` : `<span style="font-size: 0.7rem; color: var(--color-text-light);">Curadoria concluída</span>`}
      </td>
    </tr>
  `).join('');
}

// 2. Atualizar status (Aprovar/Rejeitar)
window.updateArchitectStatus = async (id, newStatus) => {
  showFeedback('Atualizando status...', 'info');
  
  const { error } = await supabase
    .from('architects')
    .update({ status: newStatus })
    .eq('id', id);
    
  if (error) {
    showFeedback('Erro ao atualizar cadastro.', 'error');
  } else {
    showFeedback('Status do profissional atualizado!', 'success');
    loadArchitects();
  }
};

// ==========================================
// INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  loadArchitects();
  
  // Esta linha revela o painel tirando a classe 'hidden'
  document.getElementById('admin-shell').classList.remove('hidden');
  
  showFeedback('Painel pronto para uso.', 'success');
});