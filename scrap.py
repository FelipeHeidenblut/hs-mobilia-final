"""
Folio Living → HS Mobília Scraper v4
======================================
Extrai todos os produtos de folioliving.com.br e gera um CSV
com o cabeçalho exato:

  name, brand, category, dimensions, image_url, file_2d_url, file_3d_url

Instalação (rode uma vez no terminal):
    pip install requests beautifulsoup4

Uso:
    python folio_scraper.py
    → gera folio_products.csv na mesma pasta do script
"""

import csv
import os
import re
import sys
import time
import requests
from bs4 import BeautifulSoup

# ──────────────────────────────────────────────────────────────────
# CONFIGURAÇÃO
# ──────────────────────────────────────────────────────────────────
BASE_URL  = "https://folioliving.com.br"
LIST_URL  = "https://folioliving.com.br/en/produtos"
BRAND     = "Folio Living"          # fixo — sempre a mesma marca
DELAY     = 0.6                     # segundos entre requisições

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
    "Referer":         "https://folioliving.com.br/",
}

session = requests.Session()
session.headers.update(HEADERS)


# ──────────────────────────────────────────────────────────────────
# HTTP
# ──────────────────────────────────────────────────────────────────
def get_soup(url, retries=3):
    for attempt in range(retries):
        try:
            r = session.get(url, timeout=20)
            r.raise_for_status()
            return BeautifulSoup(r.text, "html.parser")
        except Exception as e:
            if attempt == retries - 1:
                print(f"  [ERRO] {url} — {e}", file=sys.stderr)
                return None
            wait = 2 * (attempt + 1)
            print(f"  [retry {attempt + 1}] aguardando {wait}s...", file=sys.stderr)
            time.sleep(wait)


def abs_url(href):
    """Transforma href relativo em URL absoluta com trailing slash."""
    url = href if href.startswith("http") else BASE_URL + href
    return url.rstrip("/") + "/"


# ──────────────────────────────────────────────────────────────────
# PÁGINA DE LISTAGEM
# Estrutura real do HTML:
#   <a href="/en/produtos/slug/"><img src="thumbnail.jpg"></a>
#   <strong><a href="/en/produtos/slug/">Nome Produto</a></strong>
#   <a href="/en/produtos/slug/">Categoria</a>
# ──────────────────────────────────────────────────────────────────
def scrape_listing():
    print("📋  Buscando lista de produtos em folioliving.com.br...")
    soup = get_soup(LIST_URL)
    if not soup:
        print("Erro ao acessar a listagem.", file=sys.stderr)
        return []

    # 1. url → thumbnail
    img_map = {}
    for a in soup.find_all("a", href=True):
        if "/produtos/" not in a["href"]:
            continue
        img = a.find("img")
        if not img:
            continue
        src = img.get("src", "")
        if "/assets/uploads/" not in src:
            continue
        url = abs_url(a["href"])
        if url not in img_map:
            img_map[url] = src if src.startswith("http") else BASE_URL + src

    # 2. url → categoria
    cat_map = {}
    for a in soup.find_all("a", href=True):
        if "/produtos/" not in a["href"]:
            continue
        if a.find("img") or a.find("strong"):   # pula links de imagem e nome
            continue
        label = a.get_text(strip=True)
        if not label or len(label) > 50:
            continue
        url = abs_url(a["href"])
        if url not in cat_map:
            cat_map[url] = label

    # 3. nomes via <strong><a>
    items = []
    seen  = set()
    for strong in soup.find_all("strong"):
        a = strong.find("a", href=True)
        if not a or "/produtos/" not in a["href"]:
            continue
        name = a.get_text(strip=True)
        if not name:
            continue
        url = abs_url(a["href"])
        if url in seen:
            continue
        seen.add(url)
        items.append({
            "url":      url,
            "name":     name,
            "category": cat_map.get(url, ""),
            "img":      img_map.get(url, ""),
        })

    print(f"✅  {len(items)} produtos encontrados.\n")
    return items


# ──────────────────────────────────────────────────────────────────
# PÁGINA DE PRODUTO INDIVIDUAL
# Campos extraídos:
#   image_url   → primeira <img> com /assets/uploads/ no src
#   dimensions  → texto após "Size:" ex: "180x130x068x110"
#   file_3d_url → link "Download 3D"
#   file_2d_url → link "Download 2D"
# ──────────────────────────────────────────────────────────────────
def scrape_product(item):
    soup = get_soup(item["url"])
    if not soup:
        return None

    product = {
        "name":        item["name"],
        "brand":       BRAND,
        "category":    item["category"],
        "dimensions":  "",
        "image_url":   item["img"],     # fallback = thumbnail da listagem
        "file_2d_url": "",
        "file_3d_url": "",
    }

    # ── IMAGEM PRINCIPAL ──────────────────────────────────────────
    # A primeira <img> com /assets/uploads/ é sempre a foto principal.
    # As imagens da galeria ficam depois dela — não precisamos delas.
    for img in soup.find_all("img"):
        src = img.get("src", "")
        if "/assets/uploads/" in src:
            product["image_url"] = src if src.startswith("http") else BASE_URL + src
            break

    # ── DIMENSÕES ─────────────────────────────────────────────────
    # Formato: "Size: 180x130x068x110"
    # Buscamos no texto completo da página para não depender de tag específica.
    full_text = soup.get_text(" ", strip=True)
    m = re.search(r"Size\s*[:\-]\s*([\dx×0-9\s]+)", full_text, re.IGNORECASE)
    if m:
        product["dimensions"] = m.group(1).strip()

    # ── DOWNLOADS ─────────────────────────────────────────────────
    # Os links aparecem com texto exato "Download 3D" e "Download 2D".
    for a in soup.find_all("a", href=True):
        label = a.get_text(strip=True).lower()
        href  = a["href"]

        if not product["file_3d_url"] and "download 3d" in label:
            product["file_3d_url"] = href

        if not product["file_2d_url"] and "download 2d" in label:
            product["file_2d_url"] = href

    return product


# ──────────────────────────────────────────────────────────────────
# ORQUESTRAÇÃO
# ──────────────────────────────────────────────────────────────────
def scrape_all():
    items = scrape_listing()
    if not items:
        return []

    products = []
    total    = len(items)

    for i, item in enumerate(items, 1):
        # Indicadores visuais por linha
        img_ok = "✓" if item["img"] else "✗"
        cat    = item["category"] or "?"
        print(f"  [{i:3}/{total}] {item['name']:<42} cat={cat:<22} img={img_ok}")

        product = scrape_product(item)
        if product:
            products.append(product)

        time.sleep(DELAY)

    return products


# ──────────────────────────────────────────────────────────────────
# SALVAR CSV
# ──────────────────────────────────────────────────────────────────
CSV_FIELDS = ["name", "brand", "category", "dimensions", "image_url", "file_2d_url", "file_3d_url"]

def save_csv(products, filepath):
    if not products:
        print("\n⚠️  Nenhum produto para salvar.")
        return

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(products)

    total   = len(products)
    c_img   = sum(1 for p in products if p["image_url"])
    c_dim   = sum(1 for p in products if p["dimensions"])
    c_3d    = sum(1 for p in products if p["file_3d_url"])
    c_2d    = sum(1 for p in products if p["file_2d_url"])

    print(f"\n{'─'*55}")
    print(f"  ✅  Arquivo salvo: {filepath}")
    print(f"{'─'*55}")
    print(f"  Total de produtos  : {total}")
    print(f"  Com imagem         : {c_img}  ({c_img*100//total}%)")
    print(f"  Com dimensões      : {c_dim}  ({c_dim*100//total}%)")
    print(f"  Com arquivo 3D     : {c_3d}  ({c_3d*100//total}%)")
    print(f"  Com arquivo 2D     : {c_2d}  ({c_2d*100//total}%)")
    print(f"{'─'*55}\n")


# ──────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    products   = scrape_all()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path   = os.path.join(script_dir, "folio_products.csv")
    save_csv(products, out_path)