import {
  fetchPublicProductById,
  fetchProfessionalProductById,
  fetchRelatedProducts,
  getCurrentUser,
  getTechnicalFileUrl,
} from './supabase.js';
import { escapeHTML, safeHttpUrl, updateDocumentMeta } from './ui.js';
import { SITE_CONFIG } from './config.js';

function readGallery(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function dimensionsParts(value) {
  const text = String(value || 'Medidas sob consulta').replace(/Size:|Tamanho:|Dimensões:/gi, '').trim();
  const [dimensions] = text.split('*');
  return dimensions.trim();
}

function renderGallery(container, product) {
  const images = [product.image_url, ...readGallery(product.galeria_urls)]
    .map((url) => safeHttpUrl(url))
    .filter(Boolean);
  const name = escapeHTML(product.name);
  container.innerHTML = `<div class="product-gallery">${images.map((url, index) => `
    <div class="product-gallery__item">
      <img src="${escapeHTML(url)}" alt="${index ? `Detalhe ${index + 1} de` : 'Detalhe principal de'} ${name}" loading="lazy" decoding="async">
    </div>`).join('')}</div>`;
}

async function renderRelated(section, grid, product, professional) {
  const related = await fetchRelatedProducts(product.category, product.id);
  if (!related.length || !section || !grid) return;
  const target = professional ? 'arquiteto-produto.html' : 'produto.html';
  section.style.display = 'block';
  grid.innerHTML = related.map((item) => `
    <a href="${target}?id=${encodeURIComponent(item.id)}" class="product-card product-card__link">
      <div class="product-card__image-wrapper">
        <img src="${escapeHTML(safeHttpUrl(item.image_url))}" alt="${escapeHTML(item.name)}" class="product-card__image" loading="lazy" decoding="async">
      </div>
      <h3 class="product-card__title">${escapeHTML(item.name)}</h3>
    </a>`).join('');
}

export async function initProductPage({ professional = false } = {}) {
  const container = document.getElementById('product-container');
  const gallery = document.getElementById('product-gallery');
  const relatedSection = document.getElementById('related-section');
  const relatedGrid = document.getElementById('related-products-grid');
  const id = new URLSearchParams(window.location.search).get('id');

  if (!id) {
    container.innerHTML = '<p class="empty-state">Produto não encontrado.</p>';
    return;
  }

  try {
    if (professional) {
      const user = await getCurrentUser();
      if (!user) {
        window.location.replace('./arquiteto.html');
        return;
      }
    }

    const product = professional ? await fetchProfessionalProductById(id) : await fetchPublicProductById(id);
    const dimensions = professional ? dimensionsParts(product.dimensions) : '';
    const name = escapeHTML(product.name || 'Peça sem nome');
    const category = escapeHTML(product.category || product.name || '');
    const imageUrl = safeHttpUrl(product.image_url);
    const budgetUrl = `${SITE_CONFIG.contactUrl}?text=${encodeURIComponent(`Olá! Tenho interesse na peça ${product.name} e gostaria de solicitar um orçamento.`)}`;
    const technical2d = professional ? safeHttpUrl(await getTechnicalFileUrl(product.file_2d_url)) : '';
    const technical3d = professional ? safeHttpUrl(await getTechnicalFileUrl(product.file_3d_url)) : '';

    updateDocumentMeta({
      title: `${product.name} | ${SITE_CONFIG.name}`,
      description: product.description || `Conheça ${product.name}, peça da curadoria HS.`,
      image: imageUrl,
    });
    container.innerHTML = `
      <div class="product-layout">
        <div class="product-image-wrapper"><img src="${escapeHTML(imageUrl)}" alt="${name}"></div>
        <div class="product-info-wrapper">
          <div class="product-header"><span class="product-category">${category}</span><h1 class="product-title">${name}</h1></div>
          ${professional
            ? `<div class="product-specs"><div class="spec-row"><span class="spec-label">Dimensões</span><span class="spec-value">${escapeHTML(dimensions)}</span></div></div>`
            : '<div class="product-specs product-specs--public"><p class="consultation-text">Medidas sob consulta</p></div>'}
          <div class="product-about">
            <h2 class="about-title">Sobre a peça</h2>
            <p id="product-description" class="product-description is-collapsed">${escapeHTML(product.description || 'Sem descrição detalhada disponível.')}</p>
            <button id="description-toggle" class="description-toggle" type="button" aria-expanded="false" aria-controls="product-description" hidden>Ler descrição completa</button>
          </div>
          <div class="product-actions">
            ${professional ? `
              ${technical2d ? `<a href="${escapeHTML(technical2d)}" target="_blank" rel="noopener noreferrer" class="btn btn-dark">Arquivo 2D</a>` : ''}
              ${technical3d ? `<a href="${escapeHTML(technical3d)}" target="_blank" rel="noopener noreferrer" class="btn btn-dark">Bloco 3D</a>` : ''}
              ${!technical2d && !technical3d ? `<p class="technical-access-note">${product._limitedAccess ? 'Arquivos técnicos temporariamente indisponíveis.' : 'Arquivos técnicos em desenvolvimento.'}</p>` : ''}
            ` : `<a href="${escapeHTML(budgetUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-dark">Solicitar Orçamento</a>`}
          </div>
        </div>
      </div>`;

    const description = document.getElementById('product-description');
    const descriptionToggle = document.getElementById('description-toggle');
    requestAnimationFrame(() => {
      if (description.scrollHeight > description.clientHeight + 1) descriptionToggle.hidden = false;
    });
    descriptionToggle.addEventListener('click', () => {
      const expanded = descriptionToggle.getAttribute('aria-expanded') === 'true';
      description.classList.toggle('is-collapsed', expanded);
      descriptionToggle.setAttribute('aria-expanded', String(!expanded));
      descriptionToggle.textContent = expanded ? 'Ler descrição completa' : 'Mostrar menos';
    });

    renderGallery(gallery, product);
    await renderRelated(relatedSection, relatedGrid, product, professional);
  } catch (error) {
    console.error(error);
    container.innerHTML = '<p class="empty-state error-state">Não foi possível carregar os dados desta peça.</p>';
  }
}
