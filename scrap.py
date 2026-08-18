"""
Folio Living → HS Scraper v9.0 (Com Extração de Galeria)
===========================================================================
Extrai todos os produtos da versão PT-BR do site, incluindo a descrição correta
e agora puxando todas as imagens extras em alta resolução para a galeria.
"""

import csv
import os
import re
import sys
import time
import requests
import json # <-- NOVO IMPORT ADICIONADO AQUI
from bs4 import BeautifulSoup

# ──────────────────────────────────────────────────────────────────
# CONFIGURAÇÃO
# ──────────────────────────────────────────────────────────────────
BASE_URL  = "https://folioliving.com.br"
LIST_URL  = "https://folioliving.com.br/produtos"
BRAND     = "Folio Living"
DELAY     = 0.6

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

session = requests.Session()
session.headers.update(HEADERS)

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
            time.sleep(2 * (attempt + 1))

def abs_url(href):
    url = href if href.startswith("http") else BASE_URL + href
    return url.rstrip("/") + "/"

# ──────────────────────────────────────────────────────────────────
# PÁGINA DE LISTAGEM
# ──────────────────────────────────────────────────────────────────
def scrape_listing():
    print("📋  Buscando lista de produtos em folioliving.com.br (Versão PT-BR)...")
    soup = get_soup(LIST_URL)
    if not soup:
        return []

    img_map = {}
    for a in soup.find_all("a", href=True):
        if "/produtos/" in a["href"]:
            img = a.find("img")
            if img and "/assets/uploads/" in img.get("src", ""):
                url = abs_url(a["href"])
                if url not in img_map:
                    src = img.get("src")
                    img_map[url] = src if src.startswith("http") else BASE_URL + src

    items = []
    seen  = set()
    for strong in soup.find_all("strong"):
        a = strong.find("a", href=True)
        if not a or "/produtos/" not in a["href"]:
            continue
        
        full_name = a.get_text(strip=True)
        if not full_name:
            continue
            
        url = abs_url(a["href"])
        if url in seen:
            continue
        seen.add(url)
        
        clean_name = full_name.split(" - ")[0].strip() if " - " in full_name else full_name

        items.append({
            "url":       url,
            "name":      clean_name,
            "full_name": full_name,
            "img":       img_map.get(url, ""),
        })

    print(f"✅  {len(items)} produtos encontrados.\n")
    return items

# ──────────────────────────────────────────────────────────────────
# PÁGINA DE PRODUTO INDIVIDUAL
# ──────────────────────────────────────────────────────────────────
def scrape_product(item):
    soup = get_soup(item["url"])
    if not soup:
        return None

    product = {
        "name":         item["name"],
        "brand":        BRAND,
        "category":     "", 
        "dimensions":   "",
        "description":  "",
        "image_url":    item["img"],
        "galeria_urls": "[]", # <-- NOVA COLUNA INICIADA VAZIA
        "file_2d_url":  "",
        "file_3d_url":  "",
    }

    # ── 1. CATEGORIA (EXTRAÍDA DO PRÓPRIO NOME) ───────────────────────
    name_lower = product["name"].lower()
    if name_lower.startswith("mesa de centro"): product["category"] = "Mesa de Centro"
    elif name_lower.startswith("mesa de jantar"): product["category"] = "Mesa de Jantar"
    elif name_lower.startswith("mesa lateral") or name_lower.startswith("mesa de apoio"): product["category"] = "Mesa Lateral"
    elif name_lower.startswith("cadeira com braço"): product["category"] = "Cadeira"
    else: product["category"] = product["name"].split()[0].capitalize()

    # ── 2. DESCRIÇÃO ──────────────────────────────────────────────────
    description = ""
    main_area = soup.find("main") or soup.find(id="main") or soup.find(class_="site-main") or soup
    paragraphs = main_area.find_all("p")
    valid_texts = []
    ignore_words = ["size:", "tamanho:", "designed by", "design por", "designer:", "download", "baixar", "copyright", "todos os direitos", "dimensões:"]
    
    for p in paragraphs:
        text = p.get_text(strip=True)
        if len(text) > 40 and not any(x in text.lower() for x in ignore_words):
            valid_texts.append(text)
            
    if valid_texts:
        description = max(valid_texts, key=len)
    product["description"] = description

    # ── 3. MARCA E DIMENSÕES ──────────────────────────────────────────
    page_text = soup.get_text(separator=" ", strip=True)
    if "Designed by" in page_text:
        extracted_brand = page_text.split("Designed by")[1].split(".")[0].strip()
        if extracted_brand: product["brand"] = extracted_brand
    elif "Design por" in page_text:
        extracted_brand = page_text.split("Design por")[1].split(".")[0].strip()
        if extracted_brand: product["brand"] = extracted_brand
    elif "Designer:" in page_text:
        extracted_brand = page_text.split("Designer:")[1].split(".")[0].strip()
        if extracted_brand: product["brand"] = extracted_brand

    m = re.search(r"Size\s*[:\-]\s*([\dx×0-9\s]+)", page_text, re.IGNORECASE)
    if m:
        product["dimensions"] = m.group(1).strip()
    elif "Tamanho:" in page_text:
        product["dimensions"] = page_text.split("Tamanho:")[1].split(".")[0].strip()
    elif "Dimensões:" in page_text:
        product["dimensions"] = page_text.split("Dimensões:")[1].split(".")[0].strip()

    # ── 4. IMAGENS PRINCIPAIS E ARQUIVOS ──────────────────────────────
    for img in soup.find_all("img"):
        src = img.get("src", "")
        if "/assets/uploads/" in src:
            product["image_url"] = src if src.startswith("http") else BASE_URL + src
            break

    for a in soup.find_all("a", href=True):
        label = a.get_text(strip=True).lower()
        href  = a["href"]
        if not product["file_3d_url"] and ("download 3d" in label or "baixar 3d" in label or "arquivo 3d" in label or " 3d" in label):
            product["file_3d_url"] = href
        if not product["file_2d_url"] and ("download 2d" in label or "baixar 2d" in label or "arquivo 2d" in label or " 2d" in label):
            product["file_2d_url"] = href

   # ── 5. GALERIA EXTRAS (DIRETO NA FONTE) ────────────────────────
    galeria_temp = []
    
    # Busca EXATAMENTE a div do seu print que contém a classe "gallery"
    galeria_container = soup.find('div', class_=lambda c: c and 'gallery' in c.split())

    if galeria_container:
        # Pega APENAS as imagens que estão dentro dessa área específica
        for img in galeria_container.find_all('img'):
            src = img.get('data-large_image') or img.get('data-src') or img.get('src')
            
            if src and str(src).startswith('http'):
                # Limpa a URL caso tenha tamanho de miniatura
                src_alta_resolucao = re.sub(r'-\d+x\d+(?=\.\w+$)', '', src)
                
                # Evita duplicar a foto principal que já pegamos no passo 4
                img_principal_limpa = re.sub(r'-\d+x\d+(?=\.\w+$)', '', product["image_url"])
                
                if src_alta_resolucao != img_principal_limpa:
                    galeria_temp.append(src_alta_resolucao)

    # Remove duplicadas mantendo a ordem
    galeria_temp = list(dict.fromkeys(galeria_temp))
    
    # Transforma na lista JSON para o Supabase
    product["galeria_urls"] = json.dumps(galeria_temp)

    return product

# ──────────────────────────────────────────────────────────────────
# ORQUESTRAÇÃO E SALVAMENTO
# ──────────────────────────────────────────────────────────────────
def scrape_all():
    items = scrape_listing()
    products = []
    for i, item in enumerate(items, 1):
        product = scrape_product(item)
        if product:
            products.append(product)
            img_ok = "✓" if product["image_url"] else "✗"
            desc_ok = "✓" if product["description"] else "✗"
            # Conta quantas fotos achou na galeria
            qtd_galeria = len(json.loads(product["galeria_urls"]))
            
            print(f"  [{i:3}/{len(items)}] {product['name']:<25} | cat={product['category']:<12} | img={img_ok} | galeria={qtd_galeria} fotos")
        time.sleep(DELAY)
    return products

# ADICIONADA A COLUNA galeria_urls NA LISTA DE CAMPOS DO CSV
CSV_FIELDS = ["name", "brand", "category", "dimensions", "description", "image_url", "galeria_urls", "file_2d_url", "file_3d_url"]

def save_csv(products, filepath):
    if not products: return
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(products)

if __name__ == "__main__":
    products = scrape_all()
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "folio_products.csv")
    save_csv(products, out_path)
    print(f"\n🎉 Tudo pronto! CSV atualizado com as galerias salvo em:\n{out_path}")
