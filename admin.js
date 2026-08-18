import { supabase, isCurrentUserAdmin } from './supabase.js';
import { escapeHTML, safeHttpUrl } from './ui.js';

// --- ELEMENTOS DA INTERFACE ---
const feedbackEl = document.getElementById('admin-feedback');
const adminShell = document.getElementById('admin-shell');
const loginShell = document.getElementById('admin-login-shell');
const loginForm = document.getElementById('admin-login-form');

const productForm = document.getElementById('product-form');
const csvForm = document.getElementById('csv-form');
const productsTable = document.getElementById('admin-products-table');
const architectsTable = document.getElementById('architects-table');

// --- VARIÁVEIS DE PAGINAÇÃO ---
let allAdminProducts = [];
let currentPage = 1;
const itemsPerPage = 10;

// --- FUNÇÃO DE FEEDBACK ---
function showFeedback(message, type = 'info') {
  if (!feedbackEl) return;
  feedbackEl.textContent = message;
  if (type === 'error') feedbackEl.style.color = '#d9534f';
  else if (type === 'success') feedbackEl.style.color = '#4a5d4e';
  else feedbackEl.style.color = 'var(--color-accent)';
  
  setTimeout(() => { feedbackEl.textContent = ''; }, 5000);
}

// ==========================================
// CONTROLE DE ABAS (ACERVO / BLOG)
// ==========================================
function switchTab(tabName) {
  // 1. Esconde as seções
  document.getElementById('modulo-acervo').style.display = 'none';
  document.getElementById('modulo-blog').style.display = 'none';

  // 2. Remove o estado ativo dos botões
  document.getElementById('btn-tab-acervo').classList.remove('active');
  document.getElementById('btn-tab-blog').classList.remove('active');

  // 3. Mostra a aba selecionada (Acervo usa grid, Blog usa block)
  if (tabName === 'acervo') {
    document.getElementById('modulo-acervo').style.display = 'grid';
  } else {
    document.getElementById('modulo-blog').style.display = 'block';
  }
  
  // 4. Ativa o estilo no botão clicado
  document.getElementById(`btn-tab-${tabName}`).classList.add('active');
}

document.querySelectorAll('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});

// ==========================================
// AUTENTICAÇÃO DO ADMIN
// ==========================================

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('admin-email').value;
  const password = document.getElementById('admin-password').value;

  showFeedback('Verificando credenciais...', 'info');

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    showFeedback("Acesso negado: Credenciais inválidas.", "error");
  } else {
    checkAdminSession();
  }
});

async function checkAdminSession() {
  const { data: { session } } = await supabase.auth.getSession();

  const isAdmin = session ? await isCurrentUserAdmin() : false;

  if (session && isAdmin) {
    // Logado: Esconde o login e mostra o painel
    loginShell.classList.add('hidden');
    adminShell.classList.remove('hidden');
    
    // Garante que o painel inicie visível como block
    adminShell.style.display = 'block'; 
    
    loadProducts(); 
    loadArchitects();
    showFeedback('Bem-vindo ao painel de curadoria.', 'success');
  } else {
    if (session && !isAdmin) {
      await supabase.auth.signOut();
      showFeedback('Esta conta não possui permissão administrativa.', 'error');
    }
    // Não logado: Mostra o login e esconde o painel
    loginShell.classList.remove('hidden');
    adminShell.classList.add('hidden');
  }
}

// ==========================================
// GESTÃO DO ACERVO (Com Paginação e Design Novo)
// ==========================================

async function loadProducts() {
  if (productsTable) productsTable.innerHTML = '<tr><td colspan="5" style="text-align: center;">Carregando acervo...</td></tr>';

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    showFeedback('Erro ao carregar o acervo.', 'error');
    return;
  }

  // Salva a lista completa na variável e reseta a página
  allAdminProducts = data || [];
  currentPage = 1;
  renderAdminProducts();
}

function renderAdminProducts() {
  const paginationContainer = document.getElementById('pagination-controls');
  if (!productsTable) return;

  if (allAdminProducts.length === 0) {
    productsTable.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhuma peça cadastrada no acervo.</td></tr>';
    if (paginationContainer) paginationContainer.innerHTML = '';
    return;
  }

  // Calcula a fatia de 10 produtos da página atual
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const productsToShow = allAdminProducts.slice(startIndex, endIndex);

  // Renderiza a tabela com o novo design, mais respiro e limite de linhas
  productsTable.innerHTML = productsToShow.map(product => `
    <tr style="border-bottom: 1px solid #f0f0f0;">
      
      <td style="padding: 1.5rem 0.5rem; vertical-align: middle;">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <img src="${escapeHTML(safeHttpUrl(product.image_url))}" alt="Foto de ${escapeHTML(product.name)}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; background: #f0f0f0; flex-shrink: 0;">
          <strong style="color: #1a1a1a; font-weight: 500;">${escapeHTML(product.name)}</strong>
        </div>
      </td>
      
      <td style="padding: 1.5rem 0.5rem; vertical-align: middle; color: #555;">
        ${escapeHTML(product.brand || '-')}
      </td>
      
      <td style="padding: 1.5rem 0.5rem; vertical-align: middle; color: #555;">
        ${escapeHTML(product.category || '-')}
      </td>
      
      <td style="padding: 1.5rem 0.5rem; vertical-align: middle; max-width: 300px;">
        <div title="${escapeHTML(product.dimensions || '')}" style="color: #777; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${escapeHTML(product.dimensions || product.description || '-')}
        </div>
      </td>
      
      <td style="padding: 1.5rem 0.5rem; vertical-align: middle;">
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button type="button" data-action="edit-product" data-id="${escapeHTML(product.id)}" class="action-btn action-btn--edit">
            Editar
          </button>
          <button type="button" data-action="delete-product" data-id="${escapeHTML(product.id)}" class="action-btn action-btn--delete">
            Excluir
          </button>
        </div>
      </td>
      
    </tr>
  `).join('');

  renderPaginationControls(paginationContainer);
}

function renderPaginationControls(container) {
  if (!container) return;
  const totalPages = Math.ceil(allAdminProducts.length / itemsPerPage);
  
  container.innerHTML = `
    <button class="pagination-btn" type="button" data-direction="-1" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>
    <span class="page-info">Página ${currentPage} de ${totalPages || 1}</span>
    <button class="pagination-btn" type="button" data-direction="1" ${currentPage >= totalPages || totalPages === 0 ? 'disabled' : ''}>Próxima</button>
  `;
}

function changePage(direction) {
  currentPage += direction;
  renderAdminProducts();
  const tableWrap = document.querySelector('.table-wrap');
  if (tableWrap) {
    const y = tableWrap.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
}

async function deleteProduct(id) {
  if (!confirm('Tem certeza que deseja remover esta peça do acervo?')) return;
  
  const { error } = await supabase.from('products').delete().eq('id', id);
  
  if (error) {
    showFeedback('Erro ao excluir peça.', 'error');
  } else {
    showFeedback('Peça removida com sucesso.', 'success');
    
    // Atualiza a lista local sem precisar recarregar tudo do banco
    allAdminProducts = allAdminProducts.filter(p => String(p.id) !== String(id));
    
    // Corrige a página caso apague o último item
    const totalPages = Math.ceil(allAdminProducts.length / itemsPerPage);
    if (currentPage > totalPages && currentPage > 1) currentPage--;
    
    renderAdminProducts();
  }
}

async function editProduct(id) {
  try {
    const product = allAdminProducts.find(p => String(p.id) === String(id));
    
    if (!product) {
      showFeedback('Peça não encontrada localmente.', 'error');
      return;
    }

    document.getElementById('edit-product-id').value = product.id; 
    document.getElementById('product-name').value = product.name || '';
    document.getElementById('product-brand').value = product.brand || '';
    document.getElementById('product-category').value = product.category || '';
    document.getElementById('product-dimensions').value = product.dimensions || '';
    document.getElementById('product-description').value = product.description || '';
    document.getElementById('product-image').value = product.image_url || '';
    document.getElementById('product-file-2d').value = product.file_2d_url || '';
    document.getElementById('product-file-3d').value = product.file_3d_url || '';

    const btnSalvar = document.getElementById('btn-submit'); 
    if (btnSalvar) {
        btnSalvar.textContent = "Atualizar Peça";
        btnSalvar.style.backgroundColor = "#C68E58";
        btnSalvar.style.borderColor = "#C68E58";
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (error) {
    console.error("Erro ao preparar edição:", error);
    showFeedback('Erro ao carregar dados da peça.', 'error');
  }
}

// ==========================================
// ADICIONAR NOVOS PRODUTOS
// ==========================================
if (productForm) {
  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFeedback('Processando peça...', 'info');

    const idEdit = document.getElementById('edit-product-id').value;
    const formData = new FormData(productForm);
    const productData = Object.fromEntries(formData.entries());

    Object.keys(productData).forEach(key => {
      if (!productData[key]) delete productData[key];
    });

    try {
      if (idEdit) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', idEdit);

        if (error) throw error;
        showFeedback('Peça atualizada com sucesso no acervo!', 'success');

      } else {
        const { error } = await supabase
          .from('products')
          .insert([productData]);

        if (error) throw error;
        showFeedback('Nova peça adicionada ao acervo!', 'success');
      }

      productForm.reset();
      document.getElementById('edit-product-id').value = ''; 
      
      const btnSalvar = document.getElementById('btn-submit');
      if (btnSalvar) {
        btnSalvar.textContent = "Salvar no Acervo";
        btnSalvar.style.backgroundColor = "#1a1a1a";
        btnSalvar.style.borderColor = "#1a1a1a";
      }

      loadProducts(); 

    } catch (error) {
      console.error("Erro ao salvar no acervo:", error);
      showFeedback('Erro ao salvar a peça. Verifique as informações.', 'error');
    }
  });
}

if (csvForm) {
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
}

// ==========================================
// CURADORIA DE PROFISSIONAIS
// ==========================================

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
      <td><strong>${escapeHTML(arch.full_name)}</strong></td>
      <td>${escapeHTML(arch.email)}</td>
      <td>
        <span class="status-badge ${arch.status}">
          ${arch.status === 'pending' ? 'Finalizando' : arch.status === 'approved' ? 'Ativo' : 'Bloqueado'}
        </span>
      </td>
      <td>
        <span style="font-size: 0.7rem; color: var(--color-text-light);">
          ${arch.status === 'approved' ? 'Acesso automático' : 'Entre em contato para reativar'}
        </span>
      </td>
    </tr>
  `).join('');
}

productsTable?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'edit-product') editProduct(button.dataset.id);
  if (button.dataset.action === 'delete-product') deleteProduct(button.dataset.id);
});

document.getElementById('pagination-controls')?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-direction]');
  if (button && !button.disabled) changePage(Number(button.dataset.direction));
});

// ==========================================
// FUNÇÃO DE LOGOUT
// ==========================================
const logoutBtn = document.getElementById('admin-logout-btn');

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    showFeedback('Saindo do sistema...', 'info');
    
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      showFeedback('Erro ao sair. Tente novamente.', 'error');
    } else {
      productsTable.innerHTML = '';
      architectsTable.innerHTML = '';
      allAdminProducts = []; 
      
      checkAdminSession();
    }
  });
}

// ==========================================
// MÓDULO DO BLOG (Editor e Lógica)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inicializa o Editor Quill (Se a div existir na tela)
  if (document.getElementById('editor')) {
    window.quillEditor = new Quill('#editor', {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ 'header': [2, 3, false] }],
          ['bold', 'italic', 'underline'],
          ['link', 'blockquote', 'image'],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }]
        ]
      }
    });
  }

  // 2. Gerador Automático de Slug (URL Amigável)
  const titleInput = document.getElementById('post-title');
  const slugInput = document.getElementById('post-slug');

  if (titleInput && slugInput) {
    titleInput.addEventListener('input', () => {
      const slug = titleInput.value
        .toLowerCase()
        .normalize("NFD") // Separa os acentos das letras
        .replace(/[\u0300-\u036f]/g, "") // Remove os acentos
        .replace(/[^\w\s-]/g, '') // Remove caracteres que não sejam letras ou números
        .replace(/\s+/g, '-') // Troca espaços por hífens
        .replace(/-+/g, '-'); // Evita hífens duplicados (ex: --)
      
      slugInput.value = slug;
    });
  }

  // 3. Upload de Imagem de Capa para o Supabase Storage
  const coverFileInput = document.getElementById('post-cover-file');
  const coverUrlInput = document.getElementById('post-cover');
  const uploadStatus = document.getElementById('upload-status');

  if (coverFileInput && coverUrlInput) {
    coverFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Mostra o aviso de carregamento
      uploadStatus.style.display = 'block';
      uploadStatus.textContent = 'Enviando imagem para o servidor...';
      uploadStatus.style.color = '#C68E58';

      try {
        // Gera um nome único para o arquivo para não dar conflito
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `capas-blog/${fileName}`;

        // Faz o upload para um bucket chamado 'imagens' no Supabase
        const { data, error } = await supabase.storage
          .from('imagens')
          .upload(filePath, file);

        if (error) throw error;

        // Pega a URL pública da imagem que acabou de subir
        const { data: publicUrlData } = supabase.storage
          .from('imagens')
          .getPublicUrl(filePath);

        // Preenche o campo de texto com a URL final
        coverUrlInput.value = publicUrlData.publicUrl;
        
        uploadStatus.textContent = 'Upload concluído com sucesso!';
        uploadStatus.style.color = '#4a5d4e'; // Verde sucesso

      } catch (error) {
        console.error('Erro no upload:', error);
        uploadStatus.textContent = 'Erro ao enviar imagem. Verifique o console.';
        uploadStatus.style.color = '#d9534f'; // Vermelho erro
      }
    });
  }

  // 4. Lógica de Publicação do Artigo
  const btnPublish = document.getElementById('btn-publish');

  if (btnPublish) {
    btnPublish.addEventListener('click', async () => {
      // 1. Coleta os valores digitados
      const title = document.getElementById('post-title').value;
      const slug = document.getElementById('post-slug').value;
      const coverUrl = document.getElementById('post-cover').value;
      const author = document.getElementById('post-author').value.trim() || 'Equipe HS';
      const published = document.getElementById('post-status').value === 'true';
      
      // 2. Coleta o texto enriquecido (HTML) de dentro do Quill
      const content = window.quillEditor.root.innerHTML;
      
      // Verifica se o editor está vazio (o Quill deixa um <p><br></p> invisível por padrão)
      const isContentEmpty = window.quillEditor.getText().trim().length === 0;

      // 3. Validação de segurança
      if (!title || !slug || isContentEmpty) {
        showFeedback('Por favor, preencha o título, o slug e escreva o conteúdo do artigo.', 'error');
        return;
      }

      showFeedback('Publicando artigo no blog...', 'info');

      // 4. Envia os dados para a tabela no Supabase
      try {
        const { error } = await supabase
          .from('blog_posts')
          .insert([
            {
              titulo: title,
              slug: slug,
              imagem_capa: coverUrl,
              conteudo: content,
              autor: author,
              publicado: published,
            }
          ]);

        if (error) throw error;

        // Sucesso! Mostra aviso e limpa a tela para o próximo post
        showFeedback('Artigo publicado com sucesso!', 'success');

        document.getElementById('post-title').value = '';
        document.getElementById('post-slug').value = '';
        document.getElementById('post-cover').value = '';
        document.getElementById('post-author').value = '';
        window.quillEditor.setContents([]); // Limpa o painel do Quill

      } catch (error) {
        console.error("Erro ao publicar:", error);
        showFeedback('Erro ao publicar o artigo. Verifique o console.', 'error');
      }
    });

  }
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', checkAdminSession);
