import { fetchPostBySlug } from './supabase.js';
import { escapeHTML, safeHttpUrl, updateDocumentMeta } from './ui.js';
import { sanitizeRichHTML } from './sanitize.js';

async function loadArticle() {
    const container = document.getElementById('article-content');
    
    // 1. Pega o slug da URL (ex: ?slug=tendencias-2026)
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');

    if (!slug) {
        window.location.href = 'blog.html';
        return;
    }

    try {
        const post = await fetchPostBySlug(slug);

        if (!post) throw new Error("Post não encontrado");

        // Formata a data
        const dataFormatada = new Intl.DateTimeFormat('pt-BR', { 
            day: 'numeric', month: 'long', year: 'numeric' 
        }).format(new Date(post.created_at));

        // 2. Atualiza o título da aba do navegador
        updateDocumentMeta({
            title: `${post.titulo} | HS`,
            description: `Leia ${post.titulo} no editorial da HS.`,
            image: safeHttpUrl(post.imagem_capa),
        });

        // 3. Monta o HTML da página
        container.innerHTML = `
            <article>
                <header class="article-header container">
                    <span class="article-meta">${escapeHTML(dataFormatada)} • Por ${escapeHTML(post.autor || 'Equipe HS')}</span>
                    <h1 class="article-title">${escapeHTML(post.titulo)}</h1>
                </header>

                <div class="article-cover">
                    <img src="${escapeHTML(safeHttpUrl(post.imagem_capa))}" alt="${escapeHTML(post.titulo)}">
                </div>

                <div class="article-body">
                    ${sanitizeRichHTML(post.conteudo)}
                </div>
            </article>
            
            <div class="container" style="text-align: center; padding-bottom: 8rem;">
                <a href="blog.html" style="text-decoration: none; color: #C68E58; letter-spacing: 2px; font-size: 0.8rem; text-transform: uppercase;">← Voltar ao Journal</a>
            </div>
        `;

    } catch (error) {
        console.error("Erro:", error);
        container.innerHTML = `
            <div class="container" style="padding: 15rem 0; text-align: center;">
                <h2>Artigo não encontrado</h2>
                <p>O conteúdo que você procura pode ter sido removido ou o link está incorreto.</p>
                <br>
                <a href="blog.html" class="btn-dark">Voltar ao Journal</a>
            </div>
        `;
    }
}

loadArticle();
