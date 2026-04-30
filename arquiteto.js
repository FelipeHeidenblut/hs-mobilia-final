import { supabase } from './supabase.js';

// --- ELEMENTOS DA INTERFACE ---
const feedbackEl = document.getElementById('architect-feedback');
const authShell = document.getElementById('auth-shell');
const pendingShell = document.getElementById('pending-shell');
const rejectedShell = document.getElementById('rejected-shell');
const approvedShell = document.getElementById('approved-shell');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authTabs = document.querySelectorAll('.auth-tab');
const architectProductsGrid = document.getElementById('architect-products');

// --- FUNÇÃO DE FEEDBACK ---
function showFeedback(message, type = 'info') {
  feedbackEl.textContent = message;
  if (type === 'error') feedbackEl.style.color = '#d9534f';
  else if (type === 'success') feedbackEl.style.color = '#4a5d4e';
  else feedbackEl.style.color = 'var(--color-accent)';
  
  setTimeout(() => { feedbackEl.textContent = ''; }, 5000);
}

// --- CONTROLE DAS ABAS (ENTRAR / CADASTRAR) ---
authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // Remove a classe ativa de todas as abas
    authTabs.forEach(t => {
      t.classList.remove('is-active');
      t.style.color = 'var(--color-text-light)';
    });
    
    // Ativa a aba clicada
    tab.classList.add('is-active');
    tab.style.color = 'var(--color-text)';

    // Alterna os formulários
    if (tab.dataset.authTab === 'login') {
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
    } else {
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
    }
  });
});

// --- GERENCIAMENTO DE VISUALIZAÇÃO DE TELAS ---
function showScreen(screenId) {
  [authShell, pendingShell, rejectedShell, approvedShell].forEach(el => {
    if (el) el.classList.add('hidden');
  });
  const screenToShow = document.getElementById(screenId);
  if (screenToShow) screenToShow.classList.remove('hidden');
}

// --- LÓGICA DE CADASTRO ---
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showFeedback('Enviando solicitação...', 'info');

  const formData = new FormData(registerForm);
  const fullName = formData.get('full_name');
  const email = formData.get('email');

  // Insere no banco com status 'pending' (que é o padrão da nossa tabela)
  const { error } = await supabase
    .from('architects')
    .insert([{ full_name: fullName, email: email }]);

  if (error) {
    if (error.code === '23505') { // Código de erro para "Unique Violation"
      showFeedback('Este e-mail já está cadastrado. Tente fazer login.', 'error');
    } else {
      showFeedback('Erro ao enviar solicitação. Tente novamente.', 'error');
    }
  } else {
    showFeedback('Solicitação enviada com sucesso!', 'success');
    registerForm.reset();
    // Salva o e-mail no navegador para manter a sessão
    localStorage.setItem('hs_architect_email', email);
    checkSession();
  }
});

// --- LÓGICA DE LOGIN ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showFeedback('Verificando credenciais...', 'info');

  const formData = new FormData(loginForm);
  const email = formData.get('email');

  const { data, error } = await supabase
    .from('architects')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !data) {
    showFeedback('E-mail não encontrado na nossa base de profissionais.', 'error');
  } else {
    showFeedback('Acesso liberado.', 'success');
    loginForm.reset();
    localStorage.setItem('hs_architect_email', email);
    checkSession();
  }
});

// --- CARREGAR BIBLIOTECA DE BLOCOS (APENAS APROVADOS) ---
async function loadArchitectLibrary() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    showFeedback('Erro ao carregar a biblioteca técnica.', 'error');
    return;
  }

  if (data.length === 0) {
    architectProductsGrid.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">Nenhum arquivo disponível no momento.</p>';
    return;
  }

  architectProductsGrid.innerHTML = data.map(product => `
    <article class="product-card">
      <div class="product-card__image-wrapper">
        <img class="product-card__image" src="${product.image_url}" alt="${product.name}" loading="lazy" />
      </div>
      <h3 class="product-card__title">${product.name}</h3>
      <p class="product-card__meta">${product.brand}</p>
      
      <div class="product-card__downloads" style="display: flex; gap: 1rem; margin-top: 1rem;">
        ${product.file_2d_url ? `<a href="${product.file_2d_url}" target="_blank" class="btn">Baixar 2D</a>` : ''}
        ${product.file_3d_url ? `<a href="${product.file_3d_url}" target="_blank" class="btn">Baixar 3D</a>` : ''}
      </div>
      ${(!product.file_2d_url && !product.file_3d_url) ? `<p style="font-size: 0.7rem; color: var(--color-text-light); margin-top: 1rem;">Blocos em desenvolvimento</p>` : ''}
    </article>
  `).join('');
}

// --- VERIFICAR SESSÃO E STATUS ---
async function checkSession() {
  const userEmail = localStorage.getItem('hs_architect_email');

  if (!userEmail) {
    showScreen('auth-shell');
    return;
  }

  // Consulta o status atualizado do arquiteto
  const { data, error } = await supabase
    .from('architects')
    .select('status')
    .eq('email', userEmail)
    .single();

  if (error || !data) {
    logout();
    return;
  }

  // Direciona para a tela correta com base na curadoria
  if (data.status === 'pending') {
    showScreen('pending-shell');
  } else if (data.status === 'rejected') {
    showScreen('rejected-shell');
  } else if (data.status === 'approved') {
    showScreen('approved-shell');
    loadArchitectLibrary(); // Carrega os blocos técnicos apenas se aprovado
  }
}

// --- LOGOUT ---
function logout() {
  localStorage.removeItem('hs_architect_email');
  showScreen('auth-shell');
}

// Configura os botões de sair
document.getElementById('signout-pending')?.addEventListener('click', logout);
document.getElementById('signout-rejected')?.addEventListener('click', logout);
document.getElementById('signout-approved')?.addEventListener('click', logout);

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});