import {
  supabase,
  getCurrentUser,
  getArchitectProfile,
  fetchProfessionalProducts,
  fetchTexturas,
  generateRoomPreview,
  getTechnicalFileUrl,
  removeAiProjectAssets,
  uploadAiProjectAsset,
} from './supabase.js';

import {
  escapeHTML,
  filterProductsBySearch,
  getProductDisplayName,
  getPriceRangeRows,
  renderPublicProducts,
  safeHttpUrl,
} from './ui.js';

const elements = {
  feedback: document.getElementById('architect-feedback'),
  auth: document.getElementById('auth-shell'),
  pending: document.getElementById('pending-shell'),
  rejected: document.getElementById('rejected-shell'),
  approved: document.getElementById('approved-shell'),
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  grid: document.getElementById('architect-products'),
  search: document.getElementById('searchInput'),
  category: document.getElementById('categoryFilter'),
  pagination: document.getElementById('pagination-container'),
  summary: document.getElementById('library-summary'),
  libraryTabs: document.querySelectorAll('[data-library-tab]'),
  furniturePanel: document.getElementById('furniture-library-panel'),
  texturesPanel: document.getElementById('textures-library-panel'),
  pricesPanel: document.getElementById('prices-library-panel'),
  generatorPanel: document.getElementById('generator-library-panel'),
  priceRanges: document.getElementById('professional-price-ranges'),
  textureMenu: document.getElementById('professional-texture-menu'),
  textureStatus: document.getElementById('professional-textures-status'),
  textureGroups: document.getElementById('professional-texture-groups'),
  texturePagination: document.getElementById('professional-texture-pagination'),
  generatorForm: document.getElementById('room-generator-form'),
  generatorRoomFile: document.getElementById('generator-room-file'),
  generatorWorkspace: document.getElementById('generator-workspace'),
  generatorStage: document.getElementById('generator-canvas-stage'),
  generatorRoomPreview: document.getElementById('generator-room-preview'),
  generatorProductOverlays: document.getElementById('generator-product-overlays'),
  generatorCanvas: document.getElementById('generator-mask-canvas'),
  generatorClearSelection: document.getElementById('generator-clear-selection'),
  generatorProduct: document.getElementById('generator-product'),
  generatorTexture: document.getElementById('generator-texture'),
  generatorAddItem: document.getElementById('generator-add-item'),
  generatorItems: document.getElementById('generator-items'),
  generatorItemsCount: document.getElementById('generator-items-count'),
  generatorQuality: document.getElementById('generator-quality'),
  generatorInstructions: document.getElementById('generator-instructions'),
  generatorConsent: document.getElementById('generator-consent'),
  generatorSubmit: document.getElementById('generator-submit'),
  generatorStatus: document.getElementById('generator-status'),
  generatorResult: document.getElementById('generator-result'),
  generatorResultImage: document.getElementById('generator-result-image'),
  generatorDownload: document.getElementById('generator-download'),
  generatorDemoNotice: document.getElementById('generator-demo-notice'),
};

let products = [];
let filteredProducts = [];
let textures = [];
let filteredTextures = [];
let currentPage = 1;
let currentTexturePage = 1;
let renderVersion = 0;
let activeLibrary = 'furniture';
let activeTextureMaterial = '';
let generatorRoomFile = null;
let generatorRoomObjectUrl = '';
let generatorSelection = null;
let generatorDrawStart = null;
let generatorIsDrawing = false;
let generatorItems = [];

const ITEMS_PER_PAGE = 9;
const TEXTURES_PER_PAGE = 15;
const MAX_ROOM_FILE_SIZE = 12 * 1024 * 1024;
const MIN_SELECTION_SIZE = 24;
const MAX_GENERATOR_ITEMS = 4;
const GENERATOR_ITEM_COLORS = [
  '#ffffff',
  '#d8b46a',
  '#91b7a4',
  '#c69aae',
];
const HIDDEN_TEXTURE_MATERIALS = new Set([
  'laca',
  'pintura epoxi',
  'vidro',
]);

function showFeedback(message, type = 'info') {
  if (!elements.feedback) return;

  elements.feedback.textContent = message;
  elements.feedback.dataset.type = type;
}

function normalizeInstagram(value) {
  let username = String(value || '').trim();

  if (/^https?:\/\//i.test(username)) {
    try {
      const url = new URL(username);

      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) {
        return '';
      }

      username = url.pathname.split('/').filter(Boolean)[0] || '';
    } catch {
      return '';
    }
  }

  username = username.replace(/^@/, '');

  return /^[a-zA-Z0-9._]{1,30}$/.test(username)
    ? `@${username}`
    : '';
}

function showScreen(name) {
  ['auth', 'pending', 'rejected', 'approved'].forEach((screen) => {
    elements[screen]?.classList.add('hidden');
  });

  elements[name]?.classList.remove('hidden');

  document.body.classList.toggle(
    'is-professional-authenticated',
    name === 'approved',
  );
}

function populateCategories() {
  if (!elements.category) return;

  const categories = [
    ...new Set(
      products
        .map((product) => product.category)
        .filter(Boolean),
    ),
  ].sort();

  elements.category.replaceChildren(
    new Option('Todas as Categorias', 'todos'),
  );

  categories.forEach((category) => {
    elements.category.add(new Option(category, category));
  });
}

function textureMaterial(texture) {
  return String(
    texture.categoria || 'Outros materiais',
  ).trim() || 'Outros materiais';
}

function normalizedTextureMaterial(texture) {
  return textureMaterial(texture)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function textureDisplayName(texture) {
  const nameWithoutNumbers = String(texture.nome || '')
    .replace(/\b\d[\d./_-]*\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return nameWithoutNumbers;
}

function textureColumnCount(itemCount) {
  if (itemCount <= 5) {
    return Math.max(1, itemCount);
  }

  for (let columns = 5; columns >= 3; columns -= 1) {
    if (itemCount % columns === 0) {
      return columns;
    }
  }

  for (let columns = 5; columns >= 3; columns -= 1) {
    if (itemCount % columns >= 3) {
      return columns;
    }
  }

  return 3;
}

function getTexturePage(totalItems, page) {
  const totalPages = Math.max(
    1,
    Math.ceil(totalItems / TEXTURES_PER_PAGE),
  );

  const start = (page - 1) * TEXTURES_PER_PAGE;

  return {
    start,
    end: start + TEXTURES_PER_PAGE,
    totalPages,
  };
}

function renderTexturePagination() {
  if (!elements.texturePagination) return;

  const { totalPages } = getTexturePage(
    filteredTextures.length,
    currentTexturePage,
  );

  if (
    filteredTextures.length <= TEXTURES_PER_PAGE
    || totalPages <= 1
  ) {
    elements.texturePagination.replaceChildren();
    return;
  }

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'btn-page';
  previous.textContent = 'Anterior';
  previous.disabled = currentTexturePage === 1;
  previous.dataset.texturePage = String(currentTexturePage - 1);

  const status = document.createElement('span');
  status.className = 'page-info';
  status.textContent = `Página ${currentTexturePage} de ${totalPages}`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn-page';
  next.textContent = 'Próxima';
  next.disabled = currentTexturePage === totalPages;
  next.dataset.texturePage = String(currentTexturePage + 1);

  elements.texturePagination.replaceChildren(
    previous,
    status,
    next,
  );
}

function updateLibrarySummary() {
  if (!elements.summary) return;

  if (activeLibrary === 'generator') {
    elements.summary.textContent =
      'Crie um estudo visual com as peças e acabamentos da Curadoria HS.';

    return;
  }

  if (activeLibrary === 'prices') {
    elements.summary.textContent =
      'Consulte as faixas de investimento utilizadas na curadoria.';

    return;
  }

  if (activeLibrary === 'textures') {
    const total = filteredTextures.length;

    elements.summary.textContent = total === 1
      ? '1 textura encontrada.'
      : `${total} texturas encontradas.`;

    return;
  }

  const total = filteredProducts.length;

  elements.summary.textContent = total === 1
    ? '1 peça disponível para especificação.'
    : `${total} peças disponíveis para especificação.`;
}

function setLibraryTab(tabName) {
  activeLibrary = [
    'furniture',
    'textures',
    'prices',
    'generator',
  ].includes(tabName)
    ? tabName
    : 'furniture';

  elements.libraryTabs.forEach((tab) => {
    const active = tab.dataset.libraryTab === activeLibrary;

    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  elements.furniturePanel?.classList.toggle(
    'hidden',
    activeLibrary !== 'furniture',
  );

  elements.texturesPanel?.classList.toggle(
    'hidden',
    activeLibrary !== 'textures',
  );

  elements.pricesPanel?.classList.toggle(
    'hidden',
    activeLibrary !== 'prices',
  );

  elements.generatorPanel?.classList.toggle(
    'hidden',
    activeLibrary !== 'generator',
  );

  updateLibrarySummary();
}

function renderPriceGuide() {
  if (!elements.priceRanges) return;

  elements.priceRanges.innerHTML = getPriceRangeRows()
    .map(({ symbols, range }) => `
      <tr>
        <td class="price-guide__symbols">${escapeHTML(symbols)}</td>
        <td>R$ ${escapeHTML(range)}</td>
      </tr>
    `)
    .join('');
}

function populateTextureMaterials() {
  if (!elements.textureMenu) return;

  const materials = [
    ...new Set(textures.map(textureMaterial)),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  activeTextureMaterial = materials.includes(activeTextureMaterial)
    ? activeTextureMaterial
    : (materials[0] || '');

  elements.textureMenu.innerHTML = materials
    .map((material) => {
      const active = material === activeTextureMaterial;

      const count = textures.filter(
        (texture) => textureMaterial(texture) === material,
      ).length;

      return `
        <button
          type="button"
          class="${active ? 'is-active' : ''}"
          data-professional-texture-category="${escapeHTML(material)}"
          aria-pressed="${active}"
        >
          ${escapeHTML(material)}
          <span>${count}</span>
        </button>
      `;
    })
    .join('');
}

function renderTextureLibrary() {
  if (!elements.textureGroups || !elements.textureStatus) {
    return;
  }

  elements.textureGroups.replaceChildren();
  elements.texturePagination?.replaceChildren();

  if (!filteredTextures.length) {
    elements.textureStatus.textContent = textures.length
      ? 'Nenhuma textura encontrada com esses critérios.'
      : 'Novos acabamentos serão adicionados em breve.';

    return;
  }

  elements.textureStatus.textContent = '';

  const { start, end } = getTexturePage(
    filteredTextures.length,
    currentTexturePage,
  );

  const pageTextures = filteredTextures.slice(start, end);
  const groups = new Map();

  pageTextures.forEach((texture) => {
    const material = textureMaterial(texture);

    if (!groups.has(material)) {
      groups.set(material, []);
    }

    groups.get(material).push(texture);
  });

  const markup = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([material, materialTextures]) => {
      const cards = materialTextures
        .sort((a, b) => {
          return String(a.nome || '').localeCompare(
            String(b.nome || ''),
            'pt-BR',
          );
        })
        .map((texture) => {
          const displayName = escapeHTML(
            textureDisplayName(texture),
          );

          const materialName = escapeHTML(
            textureMaterial(texture),
          );

          const imageUrl = safeHttpUrl(texture.imagem_url);

          const image = imageUrl
            ? `
              <img
                src="${escapeHTML(imageUrl)}"
                alt="Amostra de ${materialName}"
                width="640"
                height="640"
                loading="lazy"
                decoding="async"
              >
            `
            : `
              <span class="texture-card__placeholder">
                Imagem indisponível
              </span>
            `;

          const content = `
            <span class="texture-card__image">
              ${image}
            </span>

            <span class="texture-card__meta">
              ${displayName
                ? `<strong>${displayName}</strong>`
                : ''
              }

              ${imageUrl
                ? '<small>Abrir amostra ↗</small>'
                : ''
              }
            </span>
          `;

          return imageUrl
            ? `
              <a
                class="texture-card"
                href="${escapeHTML(imageUrl)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                ${content}
              </a>
            `
            : `
              <article class="texture-card">
                ${content}
              </article>
            `;
        })
        .join('');

      const totalMaterialTextures = filteredTextures.filter(
        (texture) => textureMaterial(texture) === material,
      ).length;

      const pageCount = materialTextures.length;

      return `
        <section class="texture-material-group">
          <header>
            <h2>${escapeHTML(material)}</h2>

            <span>
              ${totalMaterialTextures}
              ${totalMaterialTextures === 1
                ? 'amostra'
                : 'amostras'
              }
            </span>
          </header>

          <div
            class="texture-library-grid"
            data-columns="${textureColumnCount(pageCount)}"
          >
            ${cards}
          </div>
        </section>
      `;
    })
    .join('');

  elements.textureGroups.innerHTML = markup;
  renderTexturePagination();
}

function applyTextureFilters() {
  filteredTextures = textures.filter(
    (texture) => {
      return textureMaterial(texture) === activeTextureMaterial;
    },
  );

  currentTexturePage = 1;

  renderTextureLibrary();
  updateLibrarySummary();
}

async function loadTextureLibrary() {
  if (!elements.textureStatus) return;

  elements.textureStatus.textContent =
    'Carregando texturas e acabamentos...';

  try {
    const availableTextures = await fetchTexturas() || [];

    textures = availableTextures.filter((texture) => {
      return !HIDDEN_TEXTURE_MATERIALS.has(
        normalizedTextureMaterial(texture),
      );
    });

    populateTextureMaterials();
    applyTextureFilters();
  } catch (error) {
    console.error(
      'Não foi possível carregar as texturas:',
      error,
    );

    elements.textureStatus.textContent =
      'Não foi possível carregar a biblioteca de texturas.';
  }
}

function setGeneratorStatus(message, type = 'info') {
  if (!elements.generatorStatus) return;

  elements.generatorStatus.textContent = message;
  elements.generatorStatus.dataset.type = type;
}

function populateGeneratorOptions() {
  if (elements.generatorProduct) {
    const selectedProduct = elements.generatorProduct.value;
    const firstOption = new Option('Selecione uma peça', '');
    const categories = new Map();

    [...products]
      .sort((a, b) => {
        const categoryComparison = String(a.category || '')
          .localeCompare(String(b.category || ''), 'pt-BR');

        return categoryComparison || String(a.name || '')
          .localeCompare(String(b.name || ''), 'pt-BR');
      })
      .forEach((product) => {
        const category = String(product.category || 'Outras peças');

        if (!categories.has(category)) {
          categories.set(category, []);
        }

        categories.get(category).push(product);
      });

    const groups = [...categories.entries()].map(
      ([category, categoryProducts]) => {
        const group = document.createElement('optgroup');
        group.label = category;

        categoryProducts.forEach((product) => {
          group.append(new Option(
            getProductDisplayName(product),
            String(product.id),
          ));
        });

        return group;
      },
    );

    elements.generatorProduct.replaceChildren(
      firstOption,
      ...groups,
    );

    if (products.some(
      (product) => String(product.id) === selectedProduct,
    )) {
      elements.generatorProduct.value = selectedProduct;
    }
  }

  if (elements.generatorTexture) {
    const selectedTexture = elements.generatorTexture.value;
    const firstOption = new Option('Selecione um acabamento', '');
    const materials = new Map();

    [...textures]
      .sort((a, b) => {
        const materialComparison = textureMaterial(a)
          .localeCompare(textureMaterial(b), 'pt-BR');

        return materialComparison || String(a.nome || '')
          .localeCompare(String(b.nome || ''), 'pt-BR');
      })
      .forEach((texture) => {
        const material = textureMaterial(texture);

        if (!materials.has(material)) {
          materials.set(material, []);
        }

        materials.get(material).push(texture);
      });

    const groups = [...materials.entries()].map(
      ([material, materialTextures]) => {
        const group = document.createElement('optgroup');
        group.label = material;

        materialTextures.forEach((texture, index) => {
          const cleanName = textureDisplayName(texture);
          const label = cleanName && cleanName !== material
            ? `${material} — ${cleanName}`
            : `${material} — Amostra ${index + 1}`;

          group.append(new Option(label, String(texture.id)));
        });

        return group;
      },
    );

    elements.generatorTexture.replaceChildren(
      firstOption,
      ...groups,
    );

    if (textures.some(
      (texture) => String(texture.id) === selectedTexture,
    )) {
      elements.generatorTexture.value = selectedTexture;
    }
  }

  renderGeneratorProductOverlays();
  renderGeneratorItems();
}

function getGeneratorCanvasPoint(event) {
  const canvas = elements.generatorCanvas;
  const rect = canvas?.getBoundingClientRect();

  if (!canvas || !rect?.width || !rect.height) {
    return null;
  }

  return {
    x: Math.max(0, Math.min(
      canvas.width,
      (event.clientX - rect.left) * canvas.width / rect.width,
    )),
    y: Math.max(0, Math.min(
      canvas.height,
      (event.clientY - rect.top) * canvas.height / rect.height,
    )),
  };
}

function normalizeGeneratorSelection(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function drawGeneratorSelection() {
  const canvas = elements.generatorCanvas;
  const context = canvas?.getContext('2d');

  if (!canvas || !context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  const lineWidth = Math.max(3, canvas.width / 450);
  const drawBox = (selection, index, draft = false) => {
    const color = GENERATOR_ITEM_COLORS[
      index % GENERATOR_ITEM_COLORS.length
    ];
    const fontSize = Math.max(14, canvas.width / 55);
    const badgeSize = fontSize * 1.45;

    context.fillStyle = draft
      ? 'rgba(255, 255, 255, 0.22)'
      : 'rgba(34, 34, 34, 0.08)';
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.setLineDash(
      draft ? [lineWidth * 2, lineWidth * 1.4] : [],
    );
    context.fillRect(
      selection.x,
      selection.y,
      selection.width,
      selection.height,
    );
    context.strokeRect(
      selection.x,
      selection.y,
      selection.width,
      selection.height,
    );

    context.setLineDash([]);
    context.fillStyle = color;
    context.fillRect(
      selection.x,
      selection.y,
      badgeSize,
      badgeSize,
    );
    context.fillStyle = color === '#ffffff' ? '#222222' : '#ffffff';
    context.font = `600 ${fontSize}px Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(
      String(index + 1),
      selection.x + badgeSize / 2,
      selection.y + badgeSize / 2,
    );
  };

  generatorItems.forEach((item, index) => {
    drawBox(item.selection, index);
  });

  if (generatorSelection) {
    drawBox(generatorSelection, generatorItems.length, true);
  }
}

function renderGeneratorProductOverlays() {
  const container = elements.generatorProductOverlays;
  const canvas = elements.generatorCanvas;

  if (!container || !canvas?.width || !canvas.height) {
    return;
  }

  const previews = [...generatorItems];
  const draftProductId = elements.generatorProduct?.value;

  if (generatorSelection && draftProductId) {
    previews.push({
      productId: draftProductId,
      selection: generatorSelection,
      draft: true,
    });
  }

  const overlays = previews.flatMap((item) => {
    const product = products.find(
      (entry) => String(entry.id) === String(item.productId),
    );
    const imageUrl = safeHttpUrl(product?.image_url);

    if (!imageUrl) return [];

    const overlay = document.createElement('img');
    overlay.className = `room-generator__product-overlay${
      item.draft ? ' is-draft' : ''
    }`;
    overlay.src = imageUrl;
    overlay.alt = '';
    overlay.style.left = `${item.selection.x / canvas.width * 100}%`;
    overlay.style.top = `${item.selection.y / canvas.height * 100}%`;
    overlay.style.width = `${item.selection.width / canvas.width * 100}%`;
    overlay.style.height = `${item.selection.height / canvas.height * 100}%`;

    return [overlay];
  });

  container.replaceChildren(...overlays);
}

function generatorTextureLabel(texture) {
  if (!texture) return 'Acabamento não identificado';

  const material = textureMaterial(texture);
  const name = textureDisplayName(texture);

  return name && name !== material
    ? `${material} — ${name}`
    : material;
}

function renderGeneratorItems() {
  if (elements.generatorItemsCount) {
    elements.generatorItemsCount.textContent =
      `${generatorItems.length} de ${MAX_GENERATOR_ITEMS}`;
  }

  if (elements.generatorAddItem) {
    elements.generatorAddItem.disabled =
      generatorItems.length >= MAX_GENERATOR_ITEMS;
  }

  if (!elements.generatorItems) return;

  const itemNodes = generatorItems.map((item, index) => {
    const product = products.find(
      (entry) => String(entry.id) === String(item.productId),
    );
    const texture = textures.find(
      (entry) => String(entry.id) === String(item.textureId),
    );
    const card = document.createElement('article');
    card.className = 'room-generator__item';
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <span class="room-generator__item-number">${index + 1}</span>
      <div class="room-generator__item-copy">
        <strong>${escapeHTML(getProductDisplayName(product || {}))}</strong>
        <span>${escapeHTML(generatorTextureLabel(texture))}</span>
      </div>
      <button class="room-generator__item-remove" type="button" data-generator-remove-item="${index}">Remover</button>
    `;

    return card;
  });

  elements.generatorItems.replaceChildren(...itemNodes);
}

function addGeneratorItem({ silent = false } = {}) {
  if (generatorItems.length >= MAX_GENERATOR_ITEMS) {
    if (!silent) {
      setGeneratorStatus(
        `O limite é de ${MAX_GENERATOR_ITEMS} móveis por geração.`,
        'error',
      );
    }
    return false;
  }

  const productId = elements.generatorProduct?.value;
  const textureId = elements.generatorTexture?.value;

  if (!productId || !textureId || !generatorSelection) {
    if (!silent) {
      setGeneratorStatus(
        'Selecione o móvel e o acabamento e marque sua posição na imagem.',
        'error',
      );
    }
    return false;
  }

  generatorItems.push({
    productId,
    textureId,
    selection: { ...generatorSelection },
  });

  generatorSelection = null;
  generatorDrawStart = null;
  generatorIsDrawing = false;
  elements.generatorProduct.value = '';
  elements.generatorTexture.value = '';
  drawGeneratorSelection();
  renderGeneratorProductOverlays();
  renderGeneratorItems();

  if (!silent) {
    setGeneratorStatus(
      generatorItems.length < MAX_GENERATOR_ITEMS
        ? `Móvel ${generatorItems.length} adicionado. Você pode marcar outra peça ou gerar a ambientação.`
        : 'Composição completa. Agora você pode gerar a ambientação.',
      'success',
    );
  }

  return true;
}

function clearGeneratorSelection() {
  generatorSelection = null;
  generatorDrawStart = null;
  generatorIsDrawing = false;
  drawGeneratorSelection();
  renderGeneratorProductOverlays();
}

function resetGenerator() {
  if (generatorRoomObjectUrl) {
    URL.revokeObjectURL(generatorRoomObjectUrl);
  }

  generatorRoomFile = null;
  generatorRoomObjectUrl = '';
  generatorItems = [];
  clearGeneratorSelection();
  elements.generatorForm?.reset();
  elements.generatorWorkspace?.classList.add('hidden');
  elements.generatorResult?.classList.add('hidden');
  elements.generatorDemoNotice?.classList.add('hidden');

  if (elements.generatorRoomPreview) {
    elements.generatorRoomPreview.removeAttribute('src');
  }

  if (elements.generatorResultImage) {
    elements.generatorResultImage.removeAttribute('src');
  }

  renderGeneratorItems();
  setGeneratorStatus('');
}

function loadGeneratorRoomFile(file) {
  if (!file) return;

  const allowedTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

  if (!allowedTypes.has(file.type)) {
    elements.generatorRoomFile.value = '';
    setGeneratorStatus(
      'Envie uma imagem JPG, PNG ou WebP.',
      'error',
    );
    return;
  }

  if (file.size > MAX_ROOM_FILE_SIZE) {
    elements.generatorRoomFile.value = '';
    setGeneratorStatus(
      'A imagem deve ter no máximo 12 MB.',
      'error',
    );
    return;
  }

  if (generatorRoomObjectUrl) {
    URL.revokeObjectURL(generatorRoomObjectUrl);
  }

  generatorRoomFile = file;
  generatorRoomObjectUrl = URL.createObjectURL(file);
  generatorItems = [];
  clearGeneratorSelection();
  renderGeneratorItems();
  elements.generatorResult?.classList.add('hidden');
  elements.generatorRoomPreview.src = generatorRoomObjectUrl;
  setGeneratorStatus('Carregando imagem...', 'info');
}

function generatorCanvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Não foi possível preparar a marcação.'));
        return;
      }

      resolve(blob);
    }, 'image/png');
  });
}

async function createGeneratorMask(items) {
  const sourceCanvas = elements.generatorCanvas;

  if (!sourceCanvas || !items.length) {
    throw new Error('Adicione ao menos um móvel ao projeto.');
  }

  const mask = document.createElement('canvas');
  mask.width = sourceCanvas.width;
  mask.height = sourceCanvas.height;
  const context = mask.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, mask.width, mask.height);

  items.forEach((item) => {
    context.clearRect(
      Math.floor(item.selection.x),
      Math.floor(item.selection.y),
      Math.ceil(item.selection.width),
      Math.ceil(item.selection.height),
    );
  });

  return generatorCanvasToBlob(mask);
}

function generatorFileExtension(file) {
  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  return extensions[file?.type] || 'jpg';
}

function createGeneratorJobId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}

function renderPagination() {
  if (!elements.pagination) return;

  const totalPages = Math.ceil(
    filteredProducts.length / ITEMS_PER_PAGE,
  );

  if (totalPages <= 1) {
    elements.pagination.replaceChildren();
    return;
  }

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'btn-page';
  previous.textContent = 'Anterior';
  previous.disabled = currentPage === 1;
  previous.dataset.page = String(currentPage - 1);

  const status = document.createElement('span');
  status.className = 'page-info';
  status.textContent = `Página ${currentPage} de ${totalPages}`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn-page';
  next.textContent = 'Próxima';
  next.disabled = currentPage === totalPages;
  next.dataset.page = String(currentPage + 1);

  elements.pagination.replaceChildren(
    previous,
    status,
    next,
  );
}

async function renderPage() {
  const version = ++renderVersion;
  const start = (currentPage - 1) * ITEMS_PER_PAGE;

  const pageProducts = filteredProducts.slice(
    start,
    start + ITEMS_PER_PAGE,
  );

  const productsWithLinks = await Promise.all(
    pageProducts.map(async (product) => {
      if (!product.file_3d_url) {
        return product;
      }

      try {
        return {
          ...product,
          _file3dUrl: await getTechnicalFileUrl(
            product.file_3d_url,
          ),
        };
      } catch (error) {
        console.error(
          'Não foi possível gerar o link 3D:',
          error,
        );

        return product;
      }
    }),
  );

  if (version !== renderVersion) return;

  renderPublicProducts(
    elements.grid,
    productsWithLinks,
    { professional: true },
  );

  renderPagination();
}

function applyFilters() {
  const search = elements.search?.value.trim() || '';
  const category = elements.category?.value || 'todos';

  const productsInCategory = products.filter((product) => {
    return category === 'todos'
      || product.category === category;
  });

  filteredProducts = filterProductsBySearch(
    productsInCategory,
    search,
  );

  currentPage = 1;

  renderPage();
  updateLibrarySummary();
}

async function loadLibrary() {
  try {
    showFeedback(
      'Carregando a Curadoria HS...',
      'info',
    );

    products = await fetchProfessionalProducts();
    filteredProducts = [...products];

    populateCategories();
    updateLibrarySummary();

    await renderPage();

    if (products.some((product) => product._limitedAccess)) {
      showFeedback(
        'Curadoria carregada. Os downloads técnicos aguardam a atualização de acesso no Supabase.',
        'info',
      );
    } else {
      showFeedback('', 'info');
    }
  } catch (error) {
    console.error(error);

    showFeedback(
      'Não foi possível carregar a biblioteca técnica.',
      'error',
    );
  }

  await loadTextureLibrary();
  populateGeneratorOptions();
}

async function checkSession() {
  const user = await getCurrentUser();

  if (!user) {
    showScreen('auth');
    return false;
  }

  const profile = await getArchitectProfile();

  if (!profile) {
    showScreen('rejected');

    showFeedback(
      'Não foi possível localizar seu cadastro profissional.',
      'error',
    );

    return false;
  }

  if (profile.status === 'pending') {
    showScreen('pending');

    showFeedback(
      'Seu cadastro ainda está aguardando a aprovação da HS.',
      'info',
    );

    return false;
  }

  if (profile.status !== 'approved') {
    showScreen('rejected');

    showFeedback(
      'Este cadastro não possui acesso à área profissional.',
      'error',
    );

    return false;
  }

  showScreen('approved');
  showFeedback('', 'info');

  await loadLibrary();

  return true;
}

elements.generatorRoomFile?.addEventListener('change', () => {
  loadGeneratorRoomFile(elements.generatorRoomFile.files?.[0]);
});

elements.generatorRoomPreview?.addEventListener('load', () => {
  const image = elements.generatorRoomPreview;
  const canvas = elements.generatorCanvas;

  if (!image?.naturalWidth || !image.naturalHeight || !canvas) {
    setGeneratorStatus('Não foi possível ler esta imagem.', 'error');
    return;
  }

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  elements.generatorStage.style.minHeight = '0';
  elements.generatorWorkspace?.classList.remove('hidden');
  generatorItems = [];
  clearGeneratorSelection();
  renderGeneratorItems();
  setGeneratorStatus(
    'Imagem pronta. Selecione uma peça e arraste sobre o ambiente para marcar sua posição.',
    'success',
  );
});

elements.generatorRoomPreview?.addEventListener('error', () => {
  generatorRoomFile = null;
  elements.generatorWorkspace?.classList.add('hidden');
  setGeneratorStatus('Não foi possível abrir esta imagem.', 'error');
});

elements.generatorCanvas?.addEventListener('pointerdown', (event) => {
  if (generatorItems.length >= MAX_GENERATOR_ITEMS) {
    setGeneratorStatus(
      `O limite é de ${MAX_GENERATOR_ITEMS} móveis por geração.`,
      'error',
    );
    return;
  }

  const point = getGeneratorCanvasPoint(event);
  if (!point) return;

  event.preventDefault();
  generatorIsDrawing = true;
  generatorDrawStart = point;
  generatorSelection = {
    x: point.x,
    y: point.y,
    width: 0,
    height: 0,
  };
  elements.generatorCanvas.setPointerCapture?.(event.pointerId);
  drawGeneratorSelection();
});

elements.generatorCanvas?.addEventListener('pointermove', (event) => {
  if (!generatorIsDrawing || !generatorDrawStart) return;

  const point = getGeneratorCanvasPoint(event);
  if (!point) return;

  event.preventDefault();
  generatorSelection = normalizeGeneratorSelection(
    generatorDrawStart,
    point,
  );
  drawGeneratorSelection();
  renderGeneratorProductOverlays();
});

function finishGeneratorSelection(event) {
  if (!generatorIsDrawing) return;

  const point = getGeneratorCanvasPoint(event);

  if (point && generatorDrawStart) {
    generatorSelection = normalizeGeneratorSelection(
      generatorDrawStart,
      point,
    );
  }

  generatorIsDrawing = false;
  generatorDrawStart = null;

  if (
    !generatorSelection
    || generatorSelection.width < MIN_SELECTION_SIZE
    || generatorSelection.height < MIN_SELECTION_SIZE
  ) {
    clearGeneratorSelection();
    setGeneratorStatus(
      'A marcação ficou pequena demais. Arraste para selecionar uma área maior.',
      'error',
    );
    return;
  }

  drawGeneratorSelection();
  renderGeneratorProductOverlays();
  setGeneratorStatus(
    'Posição marcada. Clique em “Adicionar móvel ao projeto”.',
    'success',
  );
}

elements.generatorCanvas?.addEventListener(
  'pointerup',
  finishGeneratorSelection,
);

elements.generatorCanvas?.addEventListener(
  'pointercancel',
  finishGeneratorSelection,
);

elements.generatorClearSelection?.addEventListener('click', () => {
  clearGeneratorSelection();
  setGeneratorStatus(
    'Marcação removida. Arraste sobre a imagem para selecionar outra área.',
    'info',
  );
});

elements.generatorProduct?.addEventListener(
  'change',
  renderGeneratorProductOverlays,
);

elements.generatorAddItem?.addEventListener('click', () => {
  addGeneratorItem();
});

elements.generatorItems?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-generator-remove-item]');

  if (!button) return;

  const index = Number(button.dataset.generatorRemoveItem);

  if (!Number.isInteger(index) || !generatorItems[index]) return;

  generatorItems.splice(index, 1);
  drawGeneratorSelection();
  renderGeneratorProductOverlays();
  renderGeneratorItems();
  setGeneratorStatus(
    'Móvel removido da composição.',
    'info',
  );
});

elements.generatorForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!generatorRoomFile) {
    setGeneratorStatus('Escolha uma imagem do ambiente.', 'error');
    return;
  }

  const hasDraftItem = Boolean(
    generatorSelection
    || elements.generatorProduct?.value
    || elements.generatorTexture?.value,
  );

  if (hasDraftItem && !addGeneratorItem({ silent: true })) {
    setGeneratorStatus(
      'Complete o móvel atual: selecione peça e acabamento e marque sua posição.',
      'error',
    );
    return;
  }

  if (!generatorItems.length) {
    setGeneratorStatus('Adicione ao menos um móvel ao projeto.', 'error');
    return;
  }

  const user = await getCurrentUser();

  if (!user) {
    setGeneratorStatus(
      'Sua sessão expirou. Entre novamente para continuar.',
      'error',
    );
    return;
  }

  const canvas = elements.generatorCanvas;
  const jobId = createGeneratorJobId();
  const roomPath = `${user.id}/${jobId}/room.${generatorFileExtension(generatorRoomFile)}`;
  const maskPath = `${user.id}/${jobId}/mask.png`;

  elements.generatorSubmit.disabled = true;
  elements.generatorResult?.classList.add('hidden');
  setGeneratorStatus(
    'Preparando os arquivos do projeto...',
    'info',
  );

  try {
    const mask = await createGeneratorMask(generatorItems);

    await Promise.all([
      uploadAiProjectAsset(roomPath, generatorRoomFile),
      uploadAiProjectAsset(maskPath, mask),
    ]);

    setGeneratorStatus(
      'Gerando o estudo visual. Isso pode levar alguns minutos...',
      'info',
    );

    const items = generatorItems.map((item) => ({
      productId: item.productId,
      textureId: item.textureId,
      placement: {
        x: Number((item.selection.x / canvas.width).toFixed(4)),
        y: Number((item.selection.y / canvas.height).toFixed(4)),
        width: Number((item.selection.width / canvas.width).toFixed(4)),
        height: Number((item.selection.height / canvas.height).toFixed(4)),
      },
    }));

    const result = await generateRoomPreview({
      jobId,
      items,
      roomPath,
      maskPath,
      original: {
        width: canvas.width,
        height: canvas.height,
      },
      quality: elements.generatorQuality?.value || 'draft',
      instructions: elements.generatorInstructions?.value.trim() || '',
    });

    const resultUrl = safeHttpUrl(result?.resultUrl);

    if (!resultUrl) {
      throw new Error('O serviço não retornou uma imagem válida.');
    }

    elements.generatorResultImage.src = resultUrl;
    elements.generatorDownload.href = resultUrl;
    elements.generatorDownload.download = `ambientacao-hs-${jobId}.png`;
    elements.generatorDemoNotice?.classList.toggle(
      'hidden',
      !result.demo,
    );
    elements.generatorResult?.classList.remove('hidden');
    setGeneratorStatus(
      result.demo
        ? 'Demonstração concluída. Configure uma API para gerar a ambientação real.'
        : 'Ambientação gerada com sucesso.',
      'success',
    );
    elements.generatorResult?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  } catch (error) {
    console.error('Não foi possível gerar a ambientação:', error);

    try {
      await removeAiProjectAssets([
        roomPath,
        maskPath,
      ]);
    } catch (cleanupError) {
      console.warn(
        'Não foi possível remover os arquivos da tentativa:',
        cleanupError,
      );
    }

    const message = String(error?.message || '');
    const setupMissing = [
      'GENERATOR_SETUP_REQUIRED',
      'FUNCTION_NOT_FOUND',
    ].includes(error?.code)
      || /bucket not found|no such bucket|function not found|status.*404/i
        .test(message);

    setGeneratorStatus(
      setupMissing
        ? 'O gerador ainda não foi ativado no Supabase. Aplique a migration e publique a função antes do teste.'
        : message || 'Não foi possível gerar a ambientação. Tente novamente em alguns instantes.',
      'error',
    );
  } finally {
    elements.generatorSubmit.disabled = false;
  }
});

elements.registerForm?.addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    const formData = new FormData(
      elements.registerForm,
    );

    const registryType = String(
      formData.get('registry_type') || '',
    ).toUpperCase();

    const registryNumber = String(
      formData.get('registry_number') || '',
    ).trim().toUpperCase();

    const instagram = normalizeInstagram(
      formData.get('instagram'),
    );

    if (
      !['CAU', 'ABD'].includes(registryType)
      || !/^[A-Z0-9./-]{4,30}$/.test(registryNumber)
    ) {
      showFeedback(
        'Informe um registro CAU ou ABD válido.',
        'error',
      );

      return;
    }

    if (!instagram) {
      showFeedback(
        'Informe um perfil válido do Instagram, como @seuperfil.',
        'error',
      );

      return;
    }

    showFeedback(
      'Criando sua conta...',
      'info',
    );

    const { data, error } = await supabase.auth.signUp({
      email: formData.get('email'),
      password: formData.get('password'),
      options: {
        data: {
          full_name: String(
            formData.get('full_name') || '',
          ).trim(),
          account_type: 'architect',
          registry_type: registryType,
          registry_number: registryNumber,
          instagram,
        },
      },
    });

    if (error) {
      showFeedback(
        error.message === 'User already registered'
          ? 'Este e-mail já está cadastrado.'
          : 'Não foi possível criar a conta.',
        'error',
      );

      return;
    }

    elements.registerForm.reset();

    if (data.session) {
      showFeedback(
        'Cadastro recebido. Seus dados serão analisados pela HS.',
        'success',
      );

      await checkSession();
    } else {
      showFeedback(
        'Cadastro recebido. Confirme seu e-mail; o acesso será liberado após a análise da HS.',
        'success',
      );
    }
  },
);

elements.loginForm?.addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    const formData = new FormData(
      elements.loginForm,
    );

    showFeedback(
      'Verificando credenciais...',
      'info',
    );

    try {
      const { error } =
        await supabase.auth.signInWithPassword({
          email: formData.get('email'),
          password: formData.get('password'),
        });

      if (error) {
        showFeedback(
          error.message === 'Email not confirmed'
            ? 'Confirme seu e-mail antes de entrar.'
            : 'E-mail ou senha inválidos.',
          'error',
        );

        return;
      }

      elements.loginForm.reset();

      showFeedback(
        'Credenciais confirmadas. Validando seu cadastro...',
        'info',
      );

      const authenticated = await checkSession();

      if (
        !authenticated
        && !document
          .getElementById('pending-shell')
          ?.classList.contains('hidden')
      ) {
        showFeedback(
          'Seu cadastro ainda está aguardando a aprovação da HS.',
          'info',
        );
      }
    } catch (error) {
      console.error(error);

      showFeedback(
        'Não foi possível conectar ao portal. Tente novamente.',
        'error',
      );
    }
  },
);

document
  .querySelectorAll('.auth-tab')
  .forEach((tab) => {
    tab.addEventListener('click', () => {
      const loginActive =
        tab.dataset.authTab === 'login';

      document
        .querySelectorAll('.auth-tab')
        .forEach((item) => {
          const active = item === tab;

          item.classList.toggle(
            'is-active',
            active,
          );

          item.setAttribute(
            'aria-selected',
            String(active),
          );
        });

      elements.loginForm?.classList.toggle(
        'hidden',
        !loginActive,
      );

      elements.registerForm?.classList.toggle(
        'hidden',
        loginActive,
      );

      (
        loginActive
          ? elements.loginForm
          : elements.registerForm
      )?.querySelector('input')?.focus();
    });
  });

elements.search?.addEventListener(
  'input',
  applyFilters,
);

elements.category?.addEventListener(
  'change',
  applyFilters,
);

elements.textureMenu?.addEventListener(
  'click',
  (event) => {
    const button = event.target.closest(
      'button[data-professional-texture-category]',
    );

    if (!button) return;

    activeTextureMaterial =
      button.dataset.professionalTextureCategory;

    elements.textureMenu
      .querySelectorAll('button')
      .forEach((item) => {
        const active = item === button;

        item.classList.toggle(
          'is-active',
          active,
        );

        item.setAttribute(
          'aria-pressed',
          String(active),
        );
      });

    applyTextureFilters();
  },
);

elements.texturePagination?.addEventListener(
  'click',
  (event) => {
    const button = event.target.closest(
      'button[data-texture-page]',
    );

    if (!button || button.disabled) return;

    currentTexturePage = Number(
      button.dataset.texturePage,
    );

    renderTextureLibrary();

    elements.texturesPanel?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  },
);

elements.libraryTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    setLibraryTab(tab.dataset.libraryTab);
  });
});

elements.libraryTabs.forEach((tab, index) => {
  tab.addEventListener('keydown', (event) => {
    if (
      !['ArrowLeft', 'ArrowRight'].includes(event.key)
    ) {
      return;
    }

    event.preventDefault();

    const direction =
      event.key === 'ArrowRight' ? 1 : -1;

    const targetIndex =
      (
        index
        + direction
        + elements.libraryTabs.length
      ) % elements.libraryTabs.length;

    const target =
      elements.libraryTabs[targetIndex];

    setLibraryTab(target.dataset.libraryTab);
    target.focus();
  });
});

elements.pagination?.addEventListener(
  'click',
  (event) => {
    const button = event.target.closest(
      'button[data-page]',
    );

    if (!button || button.disabled) return;

    currentPage = Number(
      button.dataset.page,
    );

    renderPage();

    document
      .getElementById('approved-shell')
      ?.scrollIntoView({
        behavior: 'smooth',
      });
  },
);

document
  .querySelectorAll(
    '#signout-pending, #signout-rejected, #signout-approved',
  )
  .forEach((button) => {
    button.addEventListener(
      'click',
      async () => {
        await supabase.auth.signOut();

        products = [];
        textures = [];
        resetGenerator();

        showScreen('auth');
      },
    );
  });

renderPriceGuide();
setLibraryTab(activeLibrary);
checkSession();

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    showScreen('auth');
  }
});
