// Importa a função que já criamos anteriormente
import { fetchBlogPosts } from './supabase.js';
import { escapeHTML, safeHttpUrl } from './ui.js';

async function carregarUltimosPosts() {
    const grid = document.getElementById('latest-posts-grid');
    if (!grid) return;

    try {
        // Puxa os posts do banco de dados
        const posts = await fetchBlogPosts();

        // O segredo: usamos o .slice(0, 4) para pegar apenas os 4 mais recentes!
        const ultimosPosts = posts.slice(0, 4);

        if (ultimosPosts.length === 0) {
            grid.innerHTML = '<p style="color: var(--color-text-light);">Nenhum artigo publicado ainda.</p>';
            return;
        }

        grid.innerHTML = ultimosPosts.map(post => {
            const dataFormatada = new Intl.DateTimeFormat('pt-BR', { 
                day: 'numeric', month: 'long', year: 'numeric' 
            }).format(new Date(post.created_at));

            return `
                <a href="artigo.html?slug=${post.slug}" class="home-blog-card">
                    <div class="image-wrapper">
                        <img src="${escapeHTML(safeHttpUrl(post.imagem_capa))}" alt="${escapeHTML(post.titulo)}" loading="lazy" decoding="async">
                    </div>
                    <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--color-text-light);">
                        ${escapeHTML(dataFormatada)}
                    </div>
                    <h3 class="home-blog-title">${escapeHTML(post.titulo)}</h3>
                    <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 2px; color: #C68E58; font-weight: 500;">
                        Leia Mais
                    </div>
                </a>
            `;
        }).join('');

    } catch (error) {
        console.error("Erro ao carregar os últimos posts na home:", error);
    }
}

// Executa a função
carregarUltimosPosts();
