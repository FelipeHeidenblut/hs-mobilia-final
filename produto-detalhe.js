import {
  fetchPublicProductById,
  fetchProfessionalProductById,
  fetchRelatedProducts,
  getCurrentUser,
  getTechnicalFileUrl,
} from './supabase.js';
import { escapeHTML, getProductDisplayName, getProductDisplayText, getProductPriceSymbols, isProductPriceAboveRange, markPageAsNoIndex, safeHttpUrl, updateDocumentMeta, updateStructuredData } from './ui.js';
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
  const name = escapeHTML(getProductDisplayName(product));
  container.innerHTML = `<div class="product-gallery">${images.map((url, index) => `
    <div class="product-gallery__item">
      <img src="${escapeHTML(url)}" alt="${index ? `Detalhe ${index + 1} de` : 'Detalhe principal de'} ${name}" width="1200" height="900" loading="lazy" decoding="async">
    </div>`).join('')}</div>`;
}

async function renderRelated(section, grid, product, professional) {
  const related = await fetchRelatedProducts(product.category, product.id);
  if (!related.length || !section || !grid) return;
  const target = professional ? 'arquiteto-produto.html' : 'produto.html';
  section.style.display = 'block';
  grid.innerHTML = related.map((item) => {
    const displayName = escapeHTML(getProductDisplayName(item));
    return `
      <a href="${target}?id=${encodeURIComponent(item.id)}" class="product-card product-card__link">
        <div class="product-card__image-wrapper">
          <img src="${escapeHTML(safeHttpUrl(item.image_url))}" alt="${displayName}" class="product-card__image" width="1200" height="800" loading="lazy" decoding="async">
        </div>
        <h3 class="product-card__title">${displayName}</h3>
      </a>`;
  }).join('');
}

export async function initProductPage({ professional = false } = {}) {
  const container = document.getElementById('product-container');
  const gallery = document.getElementById('product-gallery');
  const relatedSection = document.getElementById('related-section');
  const relatedGrid = document.getElementById('related-products-grid');
  const id = new URLSearchParams(window.location.search).get('id');

  if (!id) {
    markPageAsNoIndex({ follow: !professional });
    updateDocumentMeta({ title: `Produto não encontrado | ${SITE_CONFIG.name}` });
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
    const displayName = getProductDisplayName(product);
    const name = escapeHTML(displayName);
    const category = escapeHTML(product.category || '');
    const imageUrl = safeHttpUrl(product.image_url);
    const displayDescription = getProductDisplayText(product.description || 'Sem descrição detalhada disponível.', product);
    const budgetUrl = `${SITE_CONFIG.contactUrl}?text=${encodeURIComponent(`Olá! Tenho interesse na peça ${displayName} e gostaria de solicitar um orçamento.`)}`;
    const priceSymbols = professional ? getProductPriceSymbols(product) : '';
    const highPrice = professional && isProductPriceAboveRange(product);
    const priceDisplay = highPrice
      ? 'Para mais informações sobre valores, entre em contato com um consultor.'
      : (priceSymbols || 'Sob consulta');
    const technical2d = professional ? safeHttpUrl(await getTechnicalFileUrl(product.file_2d_url)) : '';
    const technical3d = professional ? safeHttpUrl(await getTechnicalFileUrl(product.file_3d_url)) : '';

    updateDocumentMeta({
      title: `${displayName} | ${SITE_CONFIG.name}`,
      description: displayDescription || `Conheça ${displayName}, peça da curadoria HS.`,
      image: imageUrl,
      canonical: `${SITE_CONFIG.siteUrl}/${professional ? 'arquiteto-produto.html' : 'produto.html'}?id=${encodeURIComponent(id)}`,
      type: professional ? 'website' : 'product',
    });

    if (!professional) {
      const productUrl = `${SITE_CONFIG.siteUrl}/produto.html?id=${encodeURIComponent(id)}`;
      const productImages = [product.image_url, ...readGallery(product.galeria_urls)]
        .map((url) => safeHttpUrl(url))
        .filter(Boolean);
      updateStructuredData('product-structured-data', {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: displayName,
        description: displayDescription,
        image: productImages,
        category: product.category || undefined,
        url: productUrl,
        brand: { '@type': 'Brand', name: SITE_CONFIG.name },
      });
      updateStructuredData('product-breadcrumbs', {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE_CONFIG.siteUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Curadoria', item: `${SITE_CONFIG.siteUrl}/acervo.html` },
          { '@type': 'ListItem', position: 3, name: displayName, item: productUrl },
        ],
      });
    }
    container.innerHTML = `
      <div class="product-layout">
        <div class="product-image-wrapper"><img src="${escapeHTML(imageUrl)}" alt="${name}" width="1200" height="900" loading="eager" fetchpriority="high" decoding="async"></div>
        <div class="product-info-wrapper">
          <div class="product-header"><span class="product-category">${category}</span><h1 class="product-title">${name}</h1></div>
          ${professional
            ? `<div class="product-specs">
                <div class="spec-row"><span class="spec-label">Dimensões</span><span class="spec-value">${escapeHTML(dimensions)}</span></div>
                <div class="spec-row"><span class="spec-label">Faixa de preço</span><span class="spec-value ${priceSymbols ? 'product-price-symbols' : 'product-price-message'}" title="Consulte a legenda de preços no painel profissional">${escapeHTML(priceDisplay)}</span></div>
              </div>`
            : '<div class="product-specs product-specs--public"><p class="consultation-text">Medidas sob consulta</p></div>'}
          <div class="product-about">
            <h2 class="about-title">Sobre a peça</h2>
            <p id="product-description" class="product-description is-collapsed">${escapeHTML(displayDescription)}</p>
            <button id="description-toggle" class="description-toggle" type="button" aria-expanded="false" aria-controls="product-description" hidden>Ler descrição completa</button>
          </div>
          <div class="product-actions">
            ${professional ? `
              ${technical2d ? `<a href="${escapeHTML(technical2d)}" target="_blank" rel="noopener noreferrer" class="btn btn-dark">Especificação Técnica</a>` : ''}
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
    markPageAsNoIndex({ follow: !professional });
    updateDocumentMeta({ title: `Produto não encontrado | ${SITE_CONFIG.name}` });
    container.innerHTML = '<p class="empty-state error-state">Não foi possível carregar os dados desta peça.</p>';
  }
}
