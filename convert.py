#!/usr/bin/env python3
"""
Zirov — convert.py  (v6)
=========================
Uso  (desde la carpeta raíz del repo):
    python tools/convert.py <archivo.md>

Qué hace:
  1. Parsea el frontmatter YAML del .md
  2. Genera el HTML del post y lo coloca en la carpeta correcta:
       notes/     → Section: notes
       writeups/  → Section: writeups
       research/  → Section: research   ← también Section: projects
       scripting/ → Section: scripting
  3. Actualiza los índices JSON paginados y modulares:

       data/post/post-1.json        → página 1 (12 posts más recientes)
       data/post/post-2.json        → página 2 (siguientes 12)
       ...
       data/posts-index.json        → metadatos de paginación
       data/tags/index.json         → { tag: count } para todos los tags
       data/tags/tag-<slug>.json    → posts que tienen ese tag

       (legacy, ventanas deslizantes)
       data/for-you.json            → últimos 9 posts
       data/posts-recent.json       → últimos 50 posts

  4. Inyecta la entrada <url> en sitemap.xml justo antes de </urlset>
  5. Imágenes del markdown renombradas a img01.png, img02.png… con URL completa

Notas sobre paginación
----------------------
- Posts ordenados por fecha DESC (el más nuevo en post-1.json).
- Cada archivo de página contiene exactamente POSTS_PER_PAGE entradas (salvo
  la última página, que puede contener menos).
- posts-index.json guarda total_posts, posts_per_page y total_pages para que
  el frontend pueda construir los controles de paginación sin cargar datos.
- Las carpetas data/post/ y data/tags/ se crean automáticamente si no existen.
- Cada rebuild regenera todos los archivos de página y de tag desde cero
  (usando el maestro data/posts.json como fuente de verdad).
"""

import sys, re, math, json, yaml, markdown
from markdown.extensions.toc import TocExtension
from pathlib import Path
from datetime import datetime

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════
DATA_DIR            = Path("data")
POST_PAGES_DIR      = DATA_DIR / "post"       # data/post/post-1.json …
TAGS_DIR            = DATA_DIR / "tags"        # data/tags/tag-ctf.json …
POSTS_INDEX_FILE    = DATA_DIR / "posts-index.json"
TAGS_INDEX_FILE     = TAGS_DIR / "index.json"
SITEMAP_FILE        = Path("sitemap.xml")

POSTS_PER_PAGE      = 12        # entradas por archivo de página
FOR_YOU_LIMIT       = 9         # ventana deslizante "for you"
POSTS_RECENT_LIMIT  = 50        # ventana deslizante "recent"

SECTION_FOLDER = {
    "notes":     "notes",
    "writeups":  "writeups",
    "research":  "research",
    "scripting": "scripting",
    "projects":  "research",
    "tools":     "tools",
}

SECTION_JSON = {
    "notes":     "notes.json",
    "writeups":  "writeups.json",
    "research":  "research.json",
    "scripting": "scripting.json",
    "projects":  "research.json",
    "tools":     "tools.json",
}

# ══════════════════════════════════════════════════════════════════════════════
#  FRONTMATTER
# ══════════════════════════════════════════════════════════════════════════════
def parse_frontmatter(text: str) -> tuple[dict, str]:
    pattern = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
    match = pattern.match(text)
    if not match:
        print("⚠️  No frontmatter found.")
        return {}, text
    return yaml.safe_load(match.group(1)) or {}, text[match.end():]

# ══════════════════════════════════════════════════════════════════════════════
#  STATS
# ══════════════════════════════════════════════════════════════════════════════
def calculate_stats(md_text: str) -> tuple[int, str]:
    clean = md_text
    clean = re.sub(r'^```\w*\s*$', '', clean, flags=re.MULTILINE)
    clean = re.sub(r'`', '', clean)
    clean = re.sub(r'^#{1,6}\s+', '', clean, flags=re.MULTILINE)
    clean = re.sub(r'^[-*+]\s+', '', clean, flags=re.MULTILINE)
    clean = re.sub(r'^\d+\.\s+', '', clean, flags=re.MULTILINE)
    clean = re.sub(r'\*{1,3}(.+?)\*{1,3}', r'\1', clean)
    clean = re.sub(r'_{1,2}(.+?)_{1,2}', r'\1', clean)
    clean = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', clean)
    clean = re.sub(r'!\[\[[^\]]*\]\]', '', clean)
    clean = re.sub(r'!\[[^\]]*\]\([^\)]*\)', '', clean)
    clean = re.sub(r'^\|[-| :]+\|$', '', clean, flags=re.MULTILINE)
    clean = re.sub(r'\|', ' ', clean)
    clean = re.sub(r'^>\s*', '', clean, flags=re.MULTILINE)
    clean = re.sub(r'^[-_*]{3,}$', '', clean, flags=re.MULTILINE)
    lines = [l for l in clean.splitlines() if l.strip()]
    clean = ' '.join(lines)
    tokens = re.findall(r"[^\s\.,;:!?\(\)\[\]{}<>\"'\\/@#\$%\^&\*\+=|~]+", clean)
    words   = [t for t in tokens if re.search(r'[a-zA-Z0-9]', t)]
    count   = len(words)
    minutes = math.ceil(count / 200)
    if minutes >= 60:  read_time = "+1 hour"
    elif minutes == 1: read_time = "1 min"
    else:              read_time = f"{minutes} min"
    return count, read_time

# ══════════════════════════════════════════════════════════════════════════════
#  FEATURES
# ══════════════════════════════════════════════════════════════════════════════
def parse_features(raw: str) -> list[str]:
    if not raw:
        return []
    raw = raw.strip()
    if raw.startswith('-'):
        items = re.findall(r'-\s*(.+)', raw)
    else:
        items = [i.strip() for i in raw.split(',') if i.strip()]
    return [i.strip() for i in items if i.strip()]

# ══════════════════════════════════════════════════════════════════════════════
#  IMAGES  —  renombrar a imgNN.ext + expandir URLs en HTML
# ══════════════════════════════════════════════════════════════════════════════
def normalize_images_in_md(md_text: str, url_images: str) -> tuple[str, dict]:
    counter  = [0]
    mapping  = {}
    base_url = url_images.rstrip("/") if url_images else ""

    def _seq(src_raw: str) -> str:
        if src_raw not in mapping:
            counter[0] += 1
            ext = Path(src_raw).suffix or ".png"
            mapping[src_raw] = f"img{counter[0]:02d}{ext}"
        return mapping[src_raw]

    def _final_url(seq_name: str) -> str:
        return f"{base_url}/{seq_name}" if base_url else seq_name

    obsidian_pat = re.compile(r'!\[\[([^\]]+?)\]\]')

    def obsidian_replacer(m):
        src_raw = m.group(1).strip()
        if src_raw.startswith(("http://", "https://")):
            return f"![]({src_raw})"
        seq_name  = _seq(src_raw)
        final_src = _final_url(seq_name)
        return f"![]({final_src})"

    md_text = obsidian_pat.sub(obsidian_replacer, md_text)

    std_pat = re.compile(r'!\[([^\]]*)\]\((__)?([^)]+?)(__)?(\s+"[^"]*")?\)')

    def std_replacer(m):
        alt        = m.group(1)
        src_raw    = m.group(3).strip()
        title_part = m.group(5) or ""
        if src_raw.startswith(("http://", "https://")):
            return m.group(0)
        seq_name  = _seq(src_raw)
        final_src = _final_url(seq_name)
        return f"![{alt}]({final_src}{title_part})"

    md_text = std_pat.sub(std_replacer, md_text)
    return md_text, mapping


def expand_image_urls_in_html(html: str, base_url: str) -> str:
    base_url = base_url.rstrip("/")

    def replacer(m):
        src = m.group(1)
        if src.startswith(("http://", "https://")):
            return m.group(0)
        return f'src="{base_url}/{src}"'

    return re.sub(r'src="([^"]+)"', replacer, html)

# ══════════════════════════════════════════════════════════════════════════════
#  MARKDOWN → HTML
# ══════════════════════════════════════════════════════════════════════════════
def md_to_body(md_text: str) -> str:
    md_text = re.sub(r'^(`{4,})(\w*)\s*$', r'```\2', md_text, flags=re.MULTILINE)
    html = markdown.markdown(
        md_text,
        extensions=[
            "fenced_code", "codehilite", "tables",
            "sane_lists", "nl2br", TocExtension(permalink=False),
        ],
        extension_configs={
            "codehilite": {
                "guess_lang": False,
                "use_pygments": False,
                "css_class": "highlight",
            }
        },
    )
    html = re.sub(r'class="language-(\w+)"', r'class="lang-\1"', html)
    html = re.sub(
        r'<div class="highlight"><pre>(.*?)</pre></div>',
        r'<pre><code>\1</code></pre>',
        html, flags=re.DOTALL,
    )
    html = re.sub(
        r'<p>\s*(<img\s[^>]+>)\s*</p>',
        r'\1',
        html,
        flags=re.DOTALL,
    )
    return html

# ══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════════════
def format_date_display(date_str: str) -> str:
    try:
        return datetime.strptime(str(date_str), "%Y-%m-%d").strftime("%b %d, %Y")
    except ValueError:
        return str(date_str)

def build_tags_html(tags_raw: str) -> str:
    tags_list = [t.strip() for t in str(tags_raw).split(",") if t.strip()]
    if not tags_list:
        return ""
    return "\n                  ".join(
        f'<a href="/page/tags.html#{t.lower().replace(" ", "-")}" class="tag">{t}</a>'
        for t in tags_list
    )

def derive_post_id(meta: dict) -> str:
    permalink = str(meta.get("Permalink", ""))
    if permalink:
        stem = permalink.rstrip("/").split("/")[-1].replace(".html", "")
        if stem:
            return stem
    return str(meta.get("TitlePost", "post")).lower().replace(" ", "-")

def parse_tags(tags_raw) -> list[str]:
    return [
        t.strip().lower().replace(" ", "-")
        for t in str(tags_raw).split(",")
        if t.strip()
    ]

# ══════════════════════════════════════════════════════════════════════════════
#  SVG ASSETS
# ══════════════════════════════════════════════════════════════════════════════
SVG_GITHUB   = '<svg fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"/></svg>'
SVG_LINKEDIN = '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z"/></svg>'
SVG_HTB      = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.996 0a1.119 1.119 0 0 0-.057.003.9.9 0 0 0-.236.05.907.907 0 0 0-.165.079L1.936 5.675a.889.889 0 0 0-.445.77v11.111a.889.889 0 0 0 .47.784l9.598 5.541.054.029v.002a.857.857 0 0 0 .083.035l.012.004c.028.01.056.018.085.026.01.001.011.003.016.004a.93.93 0 0 0 .296.015.683.683 0 0 0 .086-.015c.01 0 .011-.002.016-.004a.94.94 0 0 0 .085-.026l.012-.004a.882.882 0 0 0 .083-.035v-.002a1.086 1.086 0 0 0 .054-.029l9.599-5.541a.889.889 0 0 0 .469-.784V6.48l-.001-.026v-.008a.889.889 0 0 0-.312-.676l-.029-.026c0-.002-.01-.005-.01-.007a.899.899 0 0 0-.107-.07L12.453.127A.887.887 0 0 0 11.99 0zm.01 2.253c.072 0 .144.019.209.056l6.537 3.774a.418.418 0 0 1 0 .726l-6.537 3.774a.418.418 0 0 1-.418 0L5.26 6.807a.418.418 0 0 1 0-.726l6.537-3.774a.42.42 0 0 1 .209-.056zm-8.08 6.458a.414.414 0 0 1 .215.057l6.526 3.766a.417.417 0 0 1 .208.361v7.533a.417.417 0 0 1-.626.361l-6.523-3.766a.417.417 0 0 1-.209-.362V9.13c0-.261.196-.414.41-.418zm16.16 0c.215.004.41.177.41.418v7.532a.42.42 0 0 1-.208.362l-6.526 3.766a.417.417 0 0 1-.626-.361v-7.533c0-.149.08-.286.209-.36l6.523-3.767a.415.415 0 0 1 .216-.057z"/></svg>'
SVG_EMAIL    = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>'
SVG_YT       = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>'
SVG_TWITCH   = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>'
SVG_DISCORD  = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.031.051a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>'
SVG_LOGO     = '<svg class="logo-icon" viewBox="-0.5 -0.5 262 270" xmlns="http://www.w3.org/2000/svg"><path fill="#c82525" d="M -0.5,-0.5 C 86.8333,-0.5 174.167,-0.5 261.5,-0.5C 261.5,89.5 261.5,179.5 261.5,269.5C 174.167,269.5 86.8333,269.5 -0.5,269.5C -0.5,179.5 -0.5,89.5 -0.5,-0.5 Z"/><path fill="#f9f8f8" d="M 121.5,149.5 C 120.244,149.461 119.244,149.961 118.5,151C 143.831,151.5 169.164,151.667 194.5,151.5C 194.5,159.167 194.5,166.833 194.5,174.5C 151.167,174.5 107.833,174.5 64.5,174.5C 64.169,166.472 64.5023,158.472 65.5,150.5C 90.1104,140.298 114.777,130.298 139.5,120.5C 140.289,120.217 140.956,119.717 141.5,119C 115.835,118.5 90.1688,118.333 64.5,118.5C 64.5,110.833 64.5,103.167 64.5,95.5C 108.167,95.5 151.833,95.5 195.5,95.5C 195.831,103.528 195.498,111.528 194.5,119.5C 170.143,129.506 145.809,139.506 121.5,149.5 Z"/></svg>'
SVG_LOGO_F   = '<svg style="width:22px;height:23px;flex-shrink:0;display:block;" viewBox="-0.5 -0.5 262 270" xmlns="http://www.w3.org/2000/svg"><path fill="#c82525" d="M -0.5,-0.5 C 86.8333,-0.5 174.167,-0.5 261.5,-0.5C 261.5,89.5 261.5,179.5 261.5,269.5C 174.167,269.5 86.8333,269.5 -0.5,269.5C -0.5,179.5 -0.5,89.5 -0.5,-0.5 Z"/><path fill="#f9f8f8" d="M 121.5,149.5 C 120.244,149.461 119.244,149.961 118.5,151C 143.831,151.5 169.164,151.667 194.5,151.5C 194.5,159.167 194.5,166.833 194.5,174.5C 151.167,174.5 107.833,174.5 64.5,174.5C 64.169,166.472 64.5023,158.472 65.5,150.5C 90.1104,140.298 114.777,130.298 139.5,120.5C 140.289,120.217 140.956,119.717 141.5,119C 115.835,118.5 90.1688,118.333 64.5,118.5C 64.5,110.833 64.5,103.167 64.5,95.5C 108.167,95.5 151.833,95.5 195.5,95.5C 195.831,103.528 195.498,111.528 194.5,119.5C 170.143,129.506 145.809,139.506 121.5,149.5 Z"/></svg>'

# ══════════════════════════════════════════════════════════════════════════════
#  BUILD HTML
# ══════════════════════════════════════════════════════════════════════════════
def build_html(meta: dict, body_html: str, words: int, read_time: str) -> str:
    title_seo   = meta.get("TitleSEO",    "Post | Zirov")
    title_post  = meta.get("TitlePost",   "Sin título")
    author      = meta.get("Author",      "Zirov")
    description = meta.get("Description", "")
    keywords    = meta.get("Keywords",    "")
    url         = meta.get("URL",         "https://zirov.xyz/")
    date        = meta.get("Date",        "")
    tags_raw    = meta.get("Tags",        "")
    section     = str(meta.get("Section", "notes")).lower()
    lang        = meta.get("Lang",        "en")
    main_img    = str(meta.get("main_img", "")).strip()
    permalink   = meta.get("Permalink",   url.replace("https://zirov.xyz", ""))

    post_id = derive_post_id(meta)
    cover_img = f"https://zirov.xyz/img/{main_img if main_img else post_id}.png"
    date_display = format_date_display(str(date))

    sec_labels = {
        "writeups": "Writeups", "notes": "Notes",
        "research": "Research", "scripting": "Scripting", "projects": "Projects",
    }
    sec_pages = {
        "writeups": "/page/archives.html", "notes": "/page/notes.html",
        "research": "/page/research.html", "scripting": "/page/scripting.html",
        "projects": "/page/projects.html",
    }
    section_label = sec_labels.get(section, section.capitalize())
    section_href  = sec_pages.get(section, f"/page/{section}.html")

    tags_list    = [t.strip() for t in str(tags_raw).split(",") if t.strip()]
    tags_meta_og = "\n".join(f'  <meta property="article:tag" content="{t}">' for t in tags_list)
    jsonld_kw    = ", ".join(f'"{t}"' for t in tags_list)
    tags_html    = build_tags_html(str(tags_raw))
    words_display = f"{words:,}"
    an = ' active' if section == 'notes' else ''
    ap = ' active' if section == 'projects' else ''

    return f"""<!DOCTYPE html>
<html lang="{lang}" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- ══════════════ PRIMARY META ══════════════ -->
  <title>{title_seo}</title>
  <meta name="description" content="{description}" />
  <meta name="author"      content="{author}" />
  <meta name="robots"      content="index, follow" />
  <meta name="keywords"    content="{keywords}" />
  <link rel="canonical"    href="{url}" />

  <!-- ══════════════ OPEN GRAPH ══════════════ -->
  <meta property="og:type"                content="article" />
  <meta property="og:title"               content="{title_seo}" />
  <meta property="og:description"         content="{description}" />
  <meta property="og:url"                 content="{url}" />
  <meta property="og:site_name"           content="Zirov" />
  <meta property="og:image"              content="{cover_img}" />
  <meta property="og:image:width"        content="1200" />
  <meta property="og:image:height"       content="630" />
  <meta property="og:image:alt"          content="{title_post} — Zirov" />
  <meta property="og:locale"             content="en_US" />
  <meta property="article:author"         content="{author}" />
  <meta property="article:published_time" content="{date}" />
{tags_meta_og}

  <!-- ══════════════ TWITTER CARD ══════════════ -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="{title_seo}" />
  <meta name="twitter:description" content="{description}" />
  <meta name="twitter:image"       content="{cover_img}" />
  <meta name="twitter:image:alt"   content="{title_post} — Zirov" />

  <!-- ══════════════ SCHEMA.ORG ══════════════ -->
  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": "{title_post}",
    "description": "{description}",
    "image": "{cover_img}",
    "author": {{
      "@type": "Person",
      "name": "{author}",
      "url": "https://zirov.xyz/page/profile.html"
    }},
    "publisher": {{
      "@type": "Organization",
      "name": "Zirov",
      "url": "https://zirov.xyz/"
    }},
    "datePublished": "{date}",
    "dateModified":  "{date}",
    "url": "{url}",
    "keywords": [{jsonld_kw}],
    "articleSection": "{section_label}",
    "inLanguage": "{lang}"
  }}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@400;500;600;700;800&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/styles.css">
  <link rel="stylesheet" href="../css/search.css">
  <link rel="stylesheet" href="../css/post.css">
</head>
<body>
  <div class="menu-overlay" id="menuOverlay"></div>
  <aside class="side-menu" id="sideMenu">
    <div class="menu-profile">
      <img src="../img/profile.png" class="menu-avatar" alt="Zirov" onerror="this.style.display='none'">
      <h3 class="menu-name">Ziro<em>v</em></h3>
      <p class="menu-bio">Security Researcher · CTF Player · Blogger</p>
    </div>
    <div class="menu-nav-wrapper">
      <nav class="menu-nav">
        <a href="/" class="menu-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg><span>Home</span></a>
        <a href="../page/profile.html" class="menu-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg><span>Zirov</span></a>
        <a href="../page/archives.html" class="menu-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg><span>Archives</span></a>
        <a href="../page/notes.html" class="menu-link{an}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg><span>Notes</span></a>
        <a href="../page/tags.html" class="menu-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg><span>Tags</span></a>
        <a href="../page/projects.html" class="menu-link{ap}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg><span>Projects</span></a>
      </nav>
      <nav class="menu-nav menu-nav-secondary">
        <a href="https://youtube.com/@zirovsec" target="_blank" rel="noopener noreferrer" class="menu-link menu-link-secondary">{SVG_YT}<span>YouTube</span></a>
        <a href="https://twitch.tv/zirovsec" target="_blank" rel="noopener noreferrer" class="menu-link menu-link-secondary">{SVG_TWITCH}<span>Twitch</span></a>
        <a href="https://discord.gg/PBq8YBsq" target="_blank" rel="noopener noreferrer" class="menu-link menu-link-secondary">{SVG_DISCORD}<span>Discord</span></a>
      </nav>
    </div>
    <div class="menu-social-strip">
      <a href="https://github.com/z1rov" target="_blank" rel="noopener" class="menu-social-link" aria-label="GitHub">{SVG_GITHUB}</a>
      <a href="https://www.linkedin.com/in/fabian-g-huamani" target="_blank" rel="noopener" class="menu-social-link" aria-label="LinkedIn">{SVG_LINKEDIN}</a>
      <a href="https://profile.hackthebox.com/profile/019c52fc-d8cf-7339-9385-c0d96f6f7efb" target="_blank" rel="noopener" class="menu-social-link" aria-label="HackTheBox">{SVG_HTB}</a>
      <a href="mailto:fabian.huamani@ucsm.edu.pe" class="menu-social-link" aria-label="Email">{SVG_EMAIL}</a>
    </div>
  </aside>
  <header class="topbar">
    <button class="hamburger" id="hamburgerBtn" aria-label="Open menu">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <a class="logo-wrap" href="/">{SVG_LOGO}<span class="logo-text">Ziro<em>v</em></span></a>
    <div class="topbar-right">
      <button class="icon-btn search-btn" aria-label="Search" id="search-toggle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button>
      <button class="icon-btn" id="themeBtn" aria-label="Toggle theme">
        <svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        <svg class="i-sun"  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41"/></svg>
      </button>
      <a href="https://discord.gg/PBq8YBsq" target="_blank" rel="noopener" class="btn-join">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px;flex-shrink:0"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.031.051a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
        Join Discord
      </a>
      <a href="../page/profile.html" class="avatar"><img src="../img/profile.png" alt="Zirov" onerror="this.style.display='none'"></a>
    </div>
  </header>
  <div class="ticker"><div class="ticker-track" id="tickerTrack"></div></div>
  <main class="layout">
    <article class="col-featured post-article">
      <header class="post-header">
        <div class="post-breadcrumb">
          <a href="/">Home</a><span class="sep">›</span>
          <a href="{section_href}">{section_label}</a><span class="sep">›</span>
          <span>{title_post}</span>
        </div>
        <h1 class="post-title">{title_post}</h1>
        <div class="post-meta">
          <span class="post-date"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;opacity:0.6;flex-shrink:0;vertical-align:middle;margin-right:4px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>{date_display}</span>
          <span class="post-dot">·</span>
          <span class="post-words"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;opacity:0.6;flex-shrink:0;vertical-align:middle;margin-right:4px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><span>{words_display} words</span></span>
          <span class="post-dot">·</span>
          <span class="post-readtime"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;opacity:0.6;flex-shrink:0;vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>{read_time}</span></span>
        </div>
        <div class="post-tags">{tags_html}</div>
      </header>
      {'<img class="post-cover" src="' + cover_img + '" alt="' + title_post + ' cover" onerror="this.style.display=\'none\'"/>' if cover_img else ''}
      <div class="post-content">
{body_html}
      </div>
    </article>
    <aside class="col-sidebar"></aside>
  </main>
  <footer class="site-footer">
    <div class="footer-main">
      <div class="footer-col">
        <div class="footer-col-label">Zirov</div>
        <div class="footer-brand">{SVG_LOGO_F}<span class="footer-brand-text">Ziro<em>v</em></span></div>
        <p class="footer-tagline">CTF writeups · malware analysis<br>offensive research · built for the curious mind.</p>
        <a href="https://buymeacoffee.com/zirov" target="_blank" rel="noopener noreferrer" class="footer-coffee">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
          <div class="footer-coffee-text"><span class="footer-coffee-label">Support the work</span><span class="footer-coffee-sub">Buy me a coffee</span></div>
          <svg class="footer-coffee-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
      </div>
      <div class="footer-col">
        <div class="footer-col-label">Explore</div>
        <nav class="footer-links">
          <a href="/#writeups"  class="footer-link"><span class="footer-link-arr">›</span>Writeups</a>
          <a href="/#research"  class="footer-link"><span class="footer-link-arr">›</span>Research</a>
          <a href="/#scripting" class="footer-link"><span class="footer-link-arr">›</span>Scripting</a>
          <a href="/#notes"     class="footer-link"><span class="footer-link-arr">›</span>Notes</a>
        </nav>
      </div>
      <div class="footer-col">
        <div class="footer-col-label">Connect</div>
        <div class="footer-socials">
          <a href="https://github.com/z1rov" target="_blank" rel="noopener" class="footer-soc">{SVG_GITHUB} GitHub</a>
          <a href="https://www.linkedin.com/in/fabian-g-huamani" target="_blank" rel="noopener" class="footer-soc">{SVG_LINKEDIN} LinkedIn</a>
          <a href="https://profile.hackthebox.com/profile/019c52fc-d8cf-7339-9385-c0d96f6f7efb" target="_blank" rel="noopener" class="footer-soc">{SVG_HTB} HackTheBox</a>
          <a href="https://discord.gg/PBq8YBsq" target="_blank" rel="noopener" class="footer-soc">{SVG_DISCORD} Discord</a>
        </div>
      </div>
    </div>
    <div class="footer-bar">
      <span class="footer-copy">© 2026 <em>Zirov</em> · All rights reserved.</span>
      <div class="footer-bar-links"><a href="#" class="footer-bar-link">Privacy</a><a href="#" class="footer-bar-link">RSS</a></div>
    </div>
  </footer>
  <script src="/js/app.js"></script>
  <script src="/js/post.js"></script>
  <script src="/js/search.js"></script>
  <script src="/js/analytics.js"></script>
</body>
</html>"""

# ══════════════════════════════════════════════════════════════════════════════
#  BUILD JSON ENTRY
# ══════════════════════════════════════════════════════════════════════════════
def build_json_entry(meta: dict, words: int, read_time: str) -> dict:
    title_post   = meta.get("TitlePost",   "Sin título")
    section      = str(meta.get("Section", "notes")).lower()
    subsection   = meta.get("Subsection",  "")
    description  = meta.get("Description", "")
    url          = meta.get("URL",         "https://zirov.xyz/")
    permalink    = meta.get("Permalink",   url.replace("https://zirov.xyz", ""))
    date         = str(meta.get("Date",    ""))
    tags_raw     = meta.get("Tags",        "")
    main_img     = str(meta.get("main_img", "")).strip()
    btn_label    = meta.get("BtnLabel",    "Read More")
    features_raw = meta.get("Features",    "")
    pick_raw     = meta.get("Pick",        0)

    try:
        pick = int(pick_raw)
    except (ValueError, TypeError):
        pick = 0

    post_id = derive_post_id(meta)
    tags    = parse_tags(tags_raw)
    image   = f"/img/{main_img if main_img else post_id}.png"

    obj: dict = {
        "id":          post_id,
        "title":       title_post,
        "section":     section,
        "description": description,
        "permalink":   permalink,
        "btn_label":   btn_label,
        "date":        date,
        "tags":        tags,
        "image":       image,
        "words":       words,
        "readTime":    read_time,
    }
    if pick == 1:
        obj["pick"] = 1
    if subsection:
        obj["subsection"] = str(subsection)
    features = parse_features(str(features_raw)) if features_raw else []
    if features:
        obj["features"] = features
    return obj

# ══════════════════════════════════════════════════════════════════════════════
#  FLAT JSON HELPERS  (used by legacy sliding-window files)
# ══════════════════════════════════════════════════════════════════════════════
def read_json(path: Path) -> list[dict]:
    """Lee un JSON array de disco. Retorna [] si no existe o está corrupto."""
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []

def read_json_obj(path: Path) -> dict:
    """Lee un JSON object de disco. Retorna {} si no existe o está corrupto."""
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}

def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def upsert_front(data: list[dict], entry: dict) -> tuple[list[dict], str]:
    """Elimina entrada con mismo id, inserta al frente. Retorna (lista, status)."""
    existed = any(p.get("id") == entry["id"] for p in data)
    data = [p for p in data if p.get("id") != entry["id"]]
    data.insert(0, entry)
    return data, ("updated" if existed else "inserted")

def update_json_file(json_path: Path, new_entry: dict) -> str:
    """Upsert al inicio del array JSON. Retorna 'created', 'updated' o 'inserted'."""
    DATA_DIR.mkdir(exist_ok=True)
    was_new  = not json_path.exists()
    existing = read_json(json_path)
    data, status = upsert_front(existing, new_entry)
    write_json(json_path, data)
    return "created" if was_new else status

# ══════════════════════════════════════════════════════════════════════════════
#  LEGACY SLIDING-WINDOW FILES  (for-you.json, posts-recent.json)
# These remain unchanged to preserve frontend compatibility.
# ══════════════════════════════════════════════════════════════════════════════
def update_for_you(new_entry: dict) -> None:
    """Mantiene data/for-you.json con los FOR_YOU_LIMIT posts más recientes."""
    path = DATA_DIR / "for-you.json"
    DATA_DIR.mkdir(exist_ok=True)
    data = read_json(path)
    data, _ = upsert_front(data, new_entry)
    data = data[:FOR_YOU_LIMIT]
    write_json(path, data)
    print(f"   ✅ for-you.json     → {len(data)}/{FOR_YOU_LIMIT} posts")

def update_posts_recent(new_entry: dict) -> None:
    """Mantiene data/posts-recent.json con los POSTS_RECENT_LIMIT posts más recientes."""
    path = DATA_DIR / "posts-recent.json"
    DATA_DIR.mkdir(exist_ok=True)
    data = read_json(path)
    data, _ = upsert_front(data, new_entry)
    data = data[:POSTS_RECENT_LIMIT]
    write_json(path, data)
    print(f"   ✅ posts-recent.json → {len(data)}/{POSTS_RECENT_LIMIT} posts")

# ══════════════════════════════════════════════════════════════════════════════
#  PAGINATED POST FILES  (data/post/post-N.json)
#
#  Strategy
#  --------
#  1. Read the full master list from data/posts.json (source of truth).
#  2. Upsert the new entry at its correct position (remove old copy, prepend).
#  3. Sort the full list by date DESC so the newest posts always land in
#     the lowest-numbered page files.
#  4. Split the sorted list into chunks of POSTS_PER_PAGE entries.
#  5. Write each chunk to data/post/post-{n}.json, overwriting previous files.
#  6. Write the lightweight index to data/posts-index.json.
#
#  This guarantees:
#  • No page file ever exceeds POSTS_PER_PAGE entries.
#  • Adding a new post may shift entries across pages, but all files are
#    regenerated cleanly so there is never stale data.
# ══════════════════════════════════════════════════════════════════════════════
def _sort_key(post: dict) -> str:
    """Return a comparable date string; empty dates sort to the end."""
    return post.get("date", "") or ""

def rebuild_paginated_posts(all_posts: list[dict]) -> None:
    """
    Regenerate all data/post/post-N.json files from the full post list.

    Parameters
    ----------
    all_posts : list of post dicts, already sorted date DESC.
    """
    POST_PAGES_DIR.mkdir(parents=True, exist_ok=True)

    # ── Chunk the sorted list ────────────────────────────────────────────────
    # Example: 25 posts → chunks of 12, 12, 1 → post-1.json, post-2.json, post-3.json
    total      = len(all_posts)
    per_page   = POSTS_PER_PAGE
    total_pages = math.ceil(total / per_page) if total else 1

    for page_num in range(1, total_pages + 1):
        start = (page_num - 1) * per_page
        end   = start + per_page
        chunk = all_posts[start:end]

        page_file = POST_PAGES_DIR / f"post-{page_num}.json"
        write_json(page_file, chunk)

    # ── Remove stale page files that no longer have data ────────────────────
    # If posts were deleted externally, old post-N.json files could linger.
    existing_pages = sorted(POST_PAGES_DIR.glob("post-*.json"))
    for f in existing_pages:
        m = re.match(r"post-(\d+)\.json", f.name)
        if m and int(m.group(1)) > total_pages:
            f.unlink()
            print(f"   🗑️  Removed stale {f.name}")

    print(f"   ✅ post pages       → {total_pages} files  ({total} total posts, {per_page}/page)")

def rebuild_posts_index(all_posts: list[dict]) -> None:
    """
    Write data/posts-index.json with pagination metadata.

    Shape:
        {
          "total_posts":   240,
          "posts_per_page": 12,
          "total_pages":   20
        }

    The frontend reads this first to know how many page files to request.
    """
    total      = len(all_posts)
    per_page   = POSTS_PER_PAGE
    total_pages = math.ceil(total / per_page) if total else 1

    index = {
        "total_posts":    total,
        "posts_per_page": per_page,
        "total_pages":    total_pages,
    }
    DATA_DIR.mkdir(exist_ok=True)
    write_json(POSTS_INDEX_FILE, index)
    print(f"   ✅ posts-index.json → total={total}, pages={total_pages}")

# ══════════════════════════════════════════════════════════════════════════════
#  MODULAR TAG FILES  (data/tags/index.json + data/tags/tag-<slug>.json)
#
#  Strategy
#  --------
#  1. Scan all_posts to build a dict: { tag_slug: [post_stub, ...] }
#  2. Write data/tags/index.json  → { tag_slug: count }
#  3. For each tag write data/tags/tag-<slug>.json → [post_stub, ...]
#     Each stub contains only the fields needed for tag listings:
#     title, date, section, permalink.  (image and readTime are optional extras.)
#  4. Remove any tag file whose tag no longer exists in the corpus.
#
#  This replaces the monolithic data/tags.json.  Tag files are lightweight
#  (<30 KB for a typical tag with 50 posts) and loaded on demand.
# ══════════════════════════════════════════════════════════════════════════════
def _tag_filename(tag: str) -> str:
    """Convert a tag slug into its JSON filename, e.g. 'ctf' → 'tag-ctf.json'."""
    return f"tag-{tag}.json"

def rebuild_tag_files(all_posts: list[dict]) -> None:
    """
    Regenerate data/tags/index.json and data/tags/tag-<slug>.json for every
    tag found in all_posts.  Stale tag files are deleted.
    """
    TAGS_DIR.mkdir(parents=True, exist_ok=True)

    # ── Build tag → posts mapping ────────────────────────────────────────────
    tag_map: dict[str, list[dict]] = {}

    for post in all_posts:          # all_posts is already sorted date DESC
        stub = {
            "title":     post.get("title",     ""),
            "date":      post.get("date",      ""),
            "section":   post.get("section",   ""),
            "permalink": post.get("permalink", ""),
            # Optional extras useful for tag-listing cards:
            "image":     post.get("image",    ""),
            "readTime":  post.get("readTime", ""),
        }
        for tag in post.get("tags", []):
            tag = tag.strip().lower().replace(" ", "-")
            if not tag:
                continue
            tag_map.setdefault(tag, []).append(stub)

    # ── Write one file per tag ───────────────────────────────────────────────
    active_filenames: set[str] = set()
    for tag, stubs in sorted(tag_map.items()):
        fname = _tag_filename(tag)
        active_filenames.add(fname)
        write_json(TAGS_DIR / fname, stubs)

    # ── Write the lightweight index { tag: count } ───────────────────────────
    tag_index = {tag: len(stubs) for tag, stubs in sorted(tag_map.items())}
    write_json(TAGS_INDEX_FILE, tag_index)

    # ── Remove stale tag files ───────────────────────────────────────────────
    for existing in TAGS_DIR.glob("tag-*.json"):
        if existing.name not in active_filenames:
            existing.unlink()
            print(f"   🗑️  Removed stale {existing.name}")

    print(f"   ✅ tags/index.json  → {len(tag_index)} unique tags")
    print(f"   ✅ tags/tag-*.json  → {len(active_filenames)} tag files written")

# ══════════════════════════════════════════════════════════════════════════════
#  MASTER POSTS.JSON  (kept as source of truth, still written)
# ══════════════════════════════════════════════════════════════════════════════
def update_master_posts_json(new_entry: dict) -> list[dict]:
    """
    Upsert new_entry into data/posts.json and return the full sorted list.
    This file is the single source of truth used to rebuild all page/tag files.
    """
    master_path = DATA_DIR / "posts.json"
    DATA_DIR.mkdir(exist_ok=True)
    existing = read_json(master_path)
    data, status = upsert_front(existing, new_entry)

    # Sort the entire list date DESC so page splits are deterministic
    data = sorted(data, key=_sort_key, reverse=True)
    write_json(master_path, data)

    STATUS_ICON = {"created": "🆕", "updated": "♻️ ", "inserted": "✅"}
    icon = STATUS_ICON.get(status, "  ")
    print(f"   {icon} {status:8s} → data/posts.json   ({len(data)} posts)")
    return data

# ══════════════════════════════════════════════════════════════════════════════
#  SECTION JSON FILES  (data/notes.json, data/writeups.json, …)
#  These are kept unchanged for frontend compatibility.
# ══════════════════════════════════════════════════════════════════════════════
def update_section_json(new_entry: dict, section: str) -> None:
    section_file = SECTION_JSON.get(section)
    if not section_file:
        return
    sp = DATA_DIR / section_file
    status = update_json_file(sp, new_entry)
    STATUS_ICON = {"created": "🆕", "updated": "♻️ ", "inserted": "✅"}
    icon  = STATUS_ICON.get(status, "  ")
    count = len(read_json(sp))
    print(f"   {icon} {status:8s} → data/{section_file.ljust(18)} ({count} posts)")

# ══════════════════════════════════════════════════════════════════════════════
#  ORCHESTRATOR  (replaces the old write_to_jsons + update_tags_json)
# ══════════════════════════════════════════════════════════════════════════════
def write_to_jsons(entry: dict, section: str) -> None:
    """
    Full JSON pipeline for one new/updated post:

    1. Upsert into data/posts.json  (master, source of truth)
    2. Rebuild paginated page files  data/post/post-N.json
    3. Rebuild posts index           data/posts-index.json
    4. Rebuild tag files             data/tags/tag-<slug>.json
    5. Rebuild tags index            data/tags/index.json
    6. Update section JSON           data/<section>.json  (legacy compat)
    7. Update sliding windows        data/for-you.json / data/posts-recent.json
    """
    # Step 1 — master list (sorted date DESC, returned for downstream use)
    all_posts = update_master_posts_json(entry)

    # Step 2 & 3 — paginated pages + index
    rebuild_paginated_posts(all_posts)
    rebuild_posts_index(all_posts)

    # Step 4 & 5 — per-tag files + tag index
    rebuild_tag_files(all_posts)

    # Step 6 — section-specific JSON (frontend compat)
    update_section_json(entry, section)

    # Step 7 — legacy sliding-window files
    update_for_you(entry)
    update_posts_recent(entry)

# ══════════════════════════════════════════════════════════════════════════════
#  SITEMAP
# ══════════════════════════════════════════════════════════════════════════════
def inject_sitemap(meta: dict) -> None:
    if not SITEMAP_FILE.exists():
        print(f"   ⚠️  {SITEMAP_FILE} no encontrado — saltando.")
        return

    url      = meta.get("URL", "")
    section  = str(meta.get("Section", "notes")).lower()
    main_img = str(meta.get("main_img", "")).strip()
    date_str = str(meta.get("Date", datetime.now().strftime("%Y-%m-%d")))
    title    = meta.get("TitlePost", meta.get("TitleSEO", ""))
    stem     = url.rstrip("/").split("/")[-1].replace(".html", "")
    cover    = f"https://zirov.xyz/img/{main_img if main_img else stem}.png"

    freq_map = {
        "writeups": "never", "notes": "monthly",
        "research": "monthly", "scripting": "monthly", "projects": "monthly",
    }
    prio_map = {
        "writeups": "0.7", "notes": "0.75",
        "research": "0.75", "scripting": "0.75", "projects": "0.7",
    }

    new_entry = (
        f"  <url>\n"
        f"    <loc>{url}</loc>\n"
        f"    <lastmod>{date_str}</lastmod>\n"
        f"    <changefreq>{freq_map.get(section, 'monthly')}</changefreq>\n"
        f"    <priority>{prio_map.get(section, '0.7')}</priority>\n"
        f"    <image:image>\n"
        f"      <image:loc>{cover}</image:loc>\n"
        f"      <image:title>{title}</image:title>\n"
        f"    </image:image>\n"
        f"  </url>"
    )

    content = SITEMAP_FILE.read_text(encoding="utf-8")

    if url and url in content:
        pattern = re.compile(
            r'\s*<url>\s*\n\s*<loc>' + re.escape(url) + r'</loc>.*?</url>',
            re.DOTALL,
        )
        if pattern.search(content):
            SITEMAP_FILE.write_text(
                pattern.sub('\n' + new_entry, content), encoding="utf-8"
            )
            print(f"   ♻️  Sitemap actualizado: {url}")
            return

    if "</urlset>" in content:
        SITEMAP_FILE.write_text(
            content.replace("</urlset>", f"\n{new_entry}\n\n</urlset>"),
            encoding="utf-8",
        )
        print(f"   ✅ Sitemap inyectado: {url}")
    else:
        print("   ⚠️  </urlset> no encontrado en sitemap.xml")

# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════
def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: python tools/convert.py <archivo.md>")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f"❌ No encontrado: {input_path}")
        sys.exit(1)

    raw = input_path.read_text(encoding="utf-8")
    meta, md_content = parse_frontmatter(raw)

    section = str(meta.get("Section", "notes")).lower()
    folder  = SECTION_FOLDER.get(section, section)
    post_id = derive_post_id(meta)

    print(f"\n📄 {meta.get('TitlePost', '?')}")
    print(f"   section={section}  →  {folder}/{post_id}.html")

    # ── Stats ────────────────────────────────────────────────────────────────
    words, read_time = calculate_stats(md_content)
    print(f"   {words:,} words · {read_time}")

    # ── URL base para imágenes ───────────────────────────────────────────────
    url_images = str(meta.get("URL_IMAGES", "")).rstrip("/")

    # ── Images: renombrar en el markdown a imgNN.ext con URL absoluta ────────
    md_content, img_map = normalize_images_in_md(md_content, url_images)
    if img_map:
        for orig, seq in img_map.items():
            final = f"{url_images}/{seq}" if url_images else seq
            print(f"   img: {orig} → {final}")
    else:
        print("   img: (sin imágenes locales)")

    # ── Build HTML ───────────────────────────────────────────────────────────
    body = md_to_body(md_content)
    if url_images:
        body = expand_image_urls_in_html(body, url_images)

    out_dir  = Path(folder)
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"{post_id}.html"
    out_path.write_text(build_html(meta, body, words, read_time), encoding="utf-8")
    print(f"   ✅ HTML  → {out_path}")

    # ── JSON pipeline ────────────────────────────────────────────────────────
    entry = build_json_entry(meta, words, read_time)
    write_to_jsons(entry, section)

    # ── Sitemap ──────────────────────────────────────────────────────────────
    inject_sitemap(meta)

    print(f"\n── JSON entry ───────────────────────────────────────────")
    print(json.dumps(entry, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()