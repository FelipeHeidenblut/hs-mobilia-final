import { fetchBlogPosts } from './supabase.js';
import { escapeHTML, safeHttpUrl } from './ui.js';

async function initBlog() {
    const grid = document.getElementById('blog-grid');
    if (!grid) return;

    try {
        const posts = await fetchBlogPosts();

        if (!posts || posts.length === 0) {
            grid.innerHTML = '<p style="text-align: center; grid-column: 1 / -1; color: var(--color-text-light);">Nenhum artigo publicado ainda.</p>';
            return;
        }

        grid.innerHTML = posts.map(post => {
            // Formata a data para ficar chique (ex: 15 de Maio, 2026)
            const dataData = new Date(post.created_at);
            const dataFormatada = new Intl.DateTimeFormat('pt-BR', { 
                day: 'numeric', month: 'long', year: 'numeric' 
            }).format(dataData);

            return `
                <a href="artigo.html?slug=${post.slug}" class="blog-card">
                    <div class="blog-image-wrapper">
                        <img src="${escapeHTML(safeHttpUrl(post.imagem_capa))}" alt="${escapeHTML(post.titulo)}" loading="lazy" decoding="async">
                    </div>
                    <div class="blog-meta">${escapeHTML(dataFormatada)} • Por ${escapeHTML(post.autor || 'Equipe HS')}</div>
                    <h3 class="blog-title">${escapeHTML(post.titulo)}</h3>
                    <div class="blog-read-more">Leia Mais</div>
                </a>
            `;
        }).join('');

    } catch (error) {
        console.error("Erro ao carregar o blog:", error);
        grid.innerHTML = '<p style="grid-column: 1 / -1;">Erro ao carregar o editorial. Tente novamente mais tarde.</p>';
    }
}

// Inicia a função assim que o arquivo carrega
initBlog();
