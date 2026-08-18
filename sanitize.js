const ALLOWED_TAGS = new Set(['P', 'BR', 'H2', 'H3', 'STRONG', 'EM', 'U', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'IMG']);

export function sanitizeRichHTML(html = '') {
  const documentFragment = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

  [...documentFragment.querySelectorAll('*')].forEach((element) => {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }

    const href = element.getAttribute('href') || '';
    const src = element.getAttribute('src') || '';
    const alt = element.getAttribute('alt') || '';
    [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
    if (element.tagName === 'A') {
      if (/^https?:\/\//i.test(href)) {
        element.setAttribute('href', href);
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (element.tagName === 'IMG') {
      if (/^https?:\/\//i.test(src)) {
        element.setAttribute('src', src);
        element.setAttribute('alt', alt || 'Imagem do artigo');
        element.setAttribute('loading', 'lazy');
      } else {
        element.remove();
      }
    }
  });

  return documentFragment.innerHTML;
}
