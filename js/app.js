/* ═══════════════════════════════════════════════════════════════════════════
   ZureFX — app.js  (v3)
   Sistema de carga por sección con paginación remota para "all".

   CAMBIO PRINCIPAL (v3)
   ─────────────────────
   La sección "all" ya no carga data/posts.json completo.
   En su lugar carga páginas individuales bajo data/post/:

     data/post/post-1.json   → 12 posts más recientes
     data/post/post-2.json   → siguientes 12
     …

   El índice de paginación vive en:
     data/posts-index.json   → { total_posts, posts_per_page, total_pages }

   El sidebar (picks + tags cloud) sigue usando data/posts-recent.json
   para evitar cargar la totalidad de los posts.

   El resto del sistema (for-you, writeups, research, scripting, notes)
   no cambia: sigue usando sus archivos JSON planos de sección.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── CONSTANTS ───────────────────────────────────────────────────────────── */

var SECTION_COLOR_MAP = {
  'writeups':     '#cc2b2b',
  'research':     '#7c3aed',
  'scripting':    '#16a34a',
  'notes':        '#ca8a04',
  'cheat-sheets': '#0891b2',
  'tools':        '#db2777',
  'projects':     '#0891b2'
};

var SECTION_LABEL = {
  'research':     'Research',
  'writeups':     'Writeups',
  'notes':        'Notes',
  'scripting':    'Scripting',
  'cheat-sheets': 'Cheat Sheets',
  'tools':        'Tools',
  'projects':     'Project'
};

/* JSON file for each flat section (excludes 'all' — handled by paginated loader) */
var SECTION_FILE = {
  'for-you':  'for-you.json',
  'writeups': 'writeups.json',
  'research': 'research.json',
  'scripting':'scripting.json',
  'notes':    'notes.json',
  'tools':    'tools.json'
};

var MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var SECTIONS = ['for-you', 'all', 'writeups', 'research', 'scripting', 'notes'];

/* ── POSTS PER PAGE ─────────────────────────────────────────────────────── */
var PAGE_LIMIT = 12;

/* ── STATE ───────────────────────────────────────────────────────────────── */

/*
  CACHE stores flat section data (for-you, writeups, etc.)
  Shape: { sectionName: post[] }
*/
var CACHE          = {};

/*
  POSTS_PAGE_CACHE stores individually fetched paginated pages for "all".
  Shape: { 1: post[], 2: post[], … }
  Pages are fetched on demand and kept in memory to avoid repeat requests.
*/
var POSTS_PAGE_CACHE = {};

/*
  POSTS_INDEX holds the metadata from data/posts-index.json.
  Shape: { total_posts: N, posts_per_page: 12, total_pages: N }
  Null until first fetched.
*/
var POSTS_INDEX = null;

var currentSection = 'for-you';
var currentView    = 'grid';
var currentPage    = 1;
var loading        = false;

/* ── DOM REFS ────────────────────────────────────────────────────────────── */
var container;
var paginator;
var picksContainer;
var tagsCloud;
var btnGrid;
var btnList;
var sideMenu;
var menuOverlay;

var TAG_LIMIT = 30;

/* ── HELPERS ─────────────────────────────────────────────────────────────── */

function isMobile() { return window.innerWidth <= 640; }

function fmtDate(d) {
  var parts = d.split('-');
  var m = parseInt(parts[1], 10) - 1;
  return MONTHS[m] + ' ' + parts[0];
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function forceScrollTop() {
  setTimeout(function() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, 20);
}

function sectionColor(sec) { return SECTION_COLOR_MAP[sec] || '#cc2b2b'; }

function buildTint(sec) {
  var hex = SECTION_COLOR_MAP[sec];
  if (!hex) return 'rgba(10,10,10,0.78)';
  var r = parseInt(hex.slice(1,3), 16);
  var g = parseInt(hex.slice(3,5), 16);
  var b = parseInt(hex.slice(5,7), 16);
  var f = 0.14;
  return 'rgba(' + Math.round(r*f) + ',' + Math.round(g*f) + ',' + Math.round(b*f) + ',0.14)';
}

function getRootPrefix() {
  var depth = (window.location.pathname.match(/\//g) || []).length - 1;
  return depth > 0 ? '../'.repeat(depth) : '';
}

/* ── ICONS ───────────────────────────────────────────────────────────────── */

var iconWords = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
var iconTime  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

function buildStats(context) {
  var cls = context === 'grid' ? 'pg-stat' : 'pl-stat';
  var dot = context === 'grid' ? '<span class="pg-dot"></span>' : '<span class="pl-dot"></span>';
  return (
    '<span class="' + cls + ' stat-words">' + iconWords + '<span>— w</span></span>' +
    dot +
    '<span class="' + cls + ' stat-time">' + iconTime + '<span>? min</span></span>'
  );
}

function updateCardStats(card, data) {
  if (!data) return;
  var wordSpan = card.querySelector('.stat-words span');
  var timeSpan = card.querySelector('.stat-time span');
  if (wordSpan) wordSpan.textContent = data.words     ? data.words.toLocaleString() + ' w' : '— w';
  if (timeSpan) timeSpan.textContent = data.timeLabel ? data.timeLabel + ' read'            : '? min';
}

/* ── TAG BADGES (no-click, display only) ────────────────────────────────── */

function buildTagBadges(tags, sec) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  var color = sectionColor(sec);
  var html  = '<div class="card-tags">';
  tags.slice(0, 4).forEach(function(t) {
    html += '<span class="card-tag" style="'
      + 'color:' + color + ';'
      + 'border-color:' + color + '33;'
      + 'background:' + color + '0f'
      + '">' + t + '</span>';
  });
  html += '</div>';
  return html;
}

/* ── TICKER ──────────────────────────────────────────────────────────────── */

function buildTicker(items) {
  var track = document.getElementById('tickerTrack');
  if (!track) return;
  var all  = items.concat(items);
  var html = '';
  all.forEach(function(item) {
    html += '<span>' + item + '</span><span class="sep"> — </span>';
  });
  track.innerHTML = html;
}

function loadTicker() {
  var prefix = getRootPrefix();
  fetch(prefix + 'data/ticker.json', { cache: 'default' })
    .then(function(res) { return res.json(); })
    .then(function(data) { buildTicker(data.items || []); })
    .catch(function() {});
}

/* ══════════════════════════════════════════════════════════════════════════
   FLAT SECTION LOADER
   Used for: for-you, writeups, research, scripting, notes, tools.
   NOT used for 'all' — that uses the paginated loader below.
   ══════════════════════════════════════════════════════════════════════════ */

async function loadSection(sec) {
  if (CACHE[sec]) return CACHE[sec];

  var file = SECTION_FILE[sec];
  if (!file) { CACHE[sec] = []; return []; }

  var url = getRootPrefix() + 'data/' + file + '?v=' + Date.now();
  try {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) { CACHE[sec] = []; return []; }
    var data = await res.json();
    CACHE[sec] = Array.isArray(data) ? data : [];
    console.log('[ZFX] Loaded ' + file + ' — ' + CACHE[sec].length + ' posts');
    return CACHE[sec];
  } catch (err) {
    console.warn('[ZFX] Could not load ' + file + ':', err);
    CACHE[sec] = [];
    return [];
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGINATED POST INDEX LOADER
   Fetches data/posts-index.json once and caches it in POSTS_INDEX.
   Shape: { total_posts: N, posts_per_page: 12, total_pages: N }
   Used to know how many page files exist before fetching them.
   ══════════════════════════════════════════════════════════════════════════ */

async function loadPostsIndex() {
  if (POSTS_INDEX) return POSTS_INDEX;

  var url = getRootPrefix() + 'data/posts-index.json?v=' + Date.now();
  try {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    POSTS_INDEX = {
      total_posts:    data.total_posts    || 0,
      posts_per_page: data.posts_per_page || PAGE_LIMIT,
      total_pages:    data.total_pages    || 1
    };
    console.log('[ZFX] posts-index — ' + POSTS_INDEX.total_posts + ' posts, ' + POSTS_INDEX.total_pages + ' pages');
    return POSTS_INDEX;
  } catch (err) {
    console.warn('[ZFX] Could not load posts-index.json:', err);
    /* Fallback: treat as single page so UI still works */
    POSTS_INDEX = { total_posts: 0, posts_per_page: PAGE_LIMIT, total_pages: 1 };
    return POSTS_INDEX;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGINATED PAGE LOADER  —  loadPostsPage(page)
   Fetches data/post/post-{page}.json on demand.

   Caching:
   • POSTS_PAGE_CACHE[page] is checked first — returns instantly if present.
   • On success the result is stored under POSTS_PAGE_CACHE[page].
   • On failure an empty array is stored so the same page isn't retried.

   The returned array is the COMPLETE slice for that page (up to 12 posts).
   The render layer must NOT slice it further — it arrives ready to display.
   ══════════════════════════════════════════════════════════════════════════ */

async function loadPostsPage(page) {
  /* Return from memory cache if this page was already fetched */
  if (POSTS_PAGE_CACHE[page] !== undefined) {
    return POSTS_PAGE_CACHE[page];
  }

  var url = getRootPrefix() + 'data/post/post-' + page + '.json?v=' + Date.now();
  try {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var posts = Array.isArray(data) ? data : [];
    POSTS_PAGE_CACHE[page] = posts;   /* Store in memory cache */
    console.log('[ZFX] post/post-' + page + '.json — ' + posts.length + ' posts');
    return posts;
  } catch (err) {
    console.warn('[ZFX] Could not load post/post-' + page + '.json:', err);
    POSTS_PAGE_CACHE[page] = [];      /* Cache empty result to prevent endless retries */
    return [];
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SIDEBAR DATA LOADER
   The sidebar (picks + tags cloud) needs a representative sample of posts.
   We use data/posts-recent.json (latest 50) rather than the full corpus
   to keep the initial payload small.
   Falls back to CACHE['for-you'] if posts-recent.json is unavailable.
   ══════════════════════════════════════════════════════════════════════════ */

async function loadSidebarPosts() {
  if (CACHE['_sidebar']) return CACHE['_sidebar'];

  var url = getRootPrefix() + 'data/posts-recent.json?v=' + Date.now();
  try {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    CACHE['_sidebar'] = Array.isArray(data) ? data : [];
    console.log('[ZFX] posts-recent — ' + CACHE['_sidebar'].length + ' posts for sidebar');
    return CACHE['_sidebar'];
  } catch (err) {
    console.warn('[ZFX] Could not load posts-recent.json, falling back to for-you cache:', err);
    CACHE['_sidebar'] = CACHE['for-you'] || [];
    return CACHE['_sidebar'];
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   RENDER GRID — sin imágenes, solo color/tint + tags
   ══════════════════════════════════════════════════════════════════════════ */

function renderGrid(posts) {
  var grid = document.createElement('div');
  grid.className = 'posts-grid';
  if (posts.length === 1) grid.classList.add('cards-1');
  if (posts.length === 2) grid.classList.add('cards-2');

  posts.forEach(function(p) {
    var color = sectionColor(p.section);
    var tint  = buildTint(p.section);
    var label = capitalize(p.section);
    var card  = document.createElement('article');
    card.className = 'pg-card';

    card.innerHTML =
      '<div class="pg-visual" style="--tint:' + tint + '">' +
        '<div class="pg-visual-label"></div>' +
      '</div>' +
      '<div class="pg-body">' +
        '<div class="pg-cat" style="color:' + color + ';--cat-dot:' + color + '">' + label + '</div>' +
        '<div class="pg-title">' + p.title + '</div>' +
        '<div class="pg-desc">'  + p.description + '</div>' +
        buildTagBadges(p.tags, p.section) +
        '<div class="pg-footer">' + buildStats('grid') + '</div>' +
      '</div>';

    card.addEventListener('click', (function(href) {
      return function() { window.location.href = href; };
    })(p.permalink));

    grid.appendChild(card);
    updateCardStats(card, { words: p.words || null, timeLabel: p.readTime || null });
  });

  return grid;
}

/* ══════════════════════════════════════════════════════════════════════════
   RENDER LIST — sin imágenes, solo color/tint + tags
   ══════════════════════════════════════════════════════════════════════════ */

function renderList(posts) {
  var list = document.createElement('div');
  list.className = 'posts-list';

  posts.forEach(function(p) {
    var color = sectionColor(p.section);
    var tint  = buildTint(p.section);
    var label = capitalize(p.section);
    var item  = document.createElement('div');
    item.className = 'pl-item';

    item.innerHTML =
      '<div class="pl-visual" style="--tint:' + tint + '">' +
        '<div class="pl-grid-lines"></div>' +
        '<div class="pl-fade"></div>' +
      '</div>' +
      '<div class="pl-body">' +
        '<div class="pl-meta">' +
          '<span class="pl-cat" style="color:' + color + ';--dot-c:' + color + '">' + label + '</span>' +
          '<span class="pl-date">' + fmtDate(p.date) + '</span>' +
        '</div>' +
        '<div class="pl-title">' + p.title + '</div>' +
        '<div class="pl-desc">'  + p.description + '</div>' +
        buildTagBadges(p.tags, p.section) +
        '<div class="pl-foot">'  + buildStats('list') + '</div>' +
      '</div>';

    item.addEventListener('click', (function(href) {
      return function() { window.location.href = href; };
    })(p.permalink));

    list.appendChild(item);
    updateCardStats(item, { words: p.words || null, timeLabel: p.readTime || null });
  });

  return list;
}

/* ── RENDER PICKS ────────────────────────────────────────────────────────── */

var PICK_TINTS = ['pt1', 'pt2', 'pt3'];

function renderPicks(posts) {
  if (!picksContainer) return;
  var picks = posts.filter(function(p) { return p.pick === 1; }).slice(0, 3);
  picksContainer.innerHTML = '';

  picks.forEach(function(p, i) {
    var sectionLabel = capitalize(p.section);
    var color        = sectionColor(p.section);

    if (i > 0) {
      var sep = document.createElement('div');
      sep.className = 'pick-sep';
      picksContainer.appendChild(sep);
    }

    var li = document.createElement('li');
    li.className = 'pick';
    li.innerHTML =
      '<span class="pick-num">0' + (i + 1) + '</span>' +
      '<div class="pick-thumb ' + PICK_TINTS[i] + '"></div>' +
      '<div class="pick-info">' +
        '<span class="pick-title">' + p.title + '</span>' +
        '<span class="pick-sub">' + p.description.slice(0, 85) + '…</span>' +
        '<div class="pick-meta">' +
          '<span class="tag tag-xs" style="color:' + color + ';border-color:' + color + '44;background:' + color + '12">' + sectionLabel + '</span>' +
        '</div>' +
      '</div>';

    li.addEventListener('click', (function(href) {
      return function() { window.location.href = href; };
    })(p.permalink));

    picksContainer.appendChild(li);
  });
}

/* ── RENDER TAGS CLOUD ───────────────────────────────────────────────────── */

function renderTags(posts) {
  if (!tagsCloud) return;
  var seen = {};
  var tags = [];
  posts.forEach(function(p) {
    if (Array.isArray(p.tags)) {
      p.tags.forEach(function(t) {
        var clean = t.toLowerCase().trim();
        if (clean && !seen[clean]) { seen[clean] = true; tags.push(clean); }
      });
    }
  });

  tags = tags.slice(0, TAG_LIMIT);
  tagsCloud.innerHTML = '';
  tags.forEach(function(t) {
    var a = document.createElement('a');
    a.className = 'tag';
    a.textContent = t;
    a.href = 'page/tags.html#' + encodeURIComponent(t);
    tagsCloud.appendChild(a);
  });
}

/* ── PAGINATOR ───────────────────────────────────────────────────────────── */

function renderPaginator(totalPages, cur) {
  paginator.innerHTML = '';
  if (totalPages <= 1) return;

  var svgFirst = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>';
  var svgPrev  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>';
  var svgNext  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';
  var svgLast  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>';

  function mkBtn(html, disabled, targetPg) {
    var b = document.createElement('button');
    b.className = 'pg-btn';
    b.innerHTML = html;
    if (disabled) {
      b.disabled = true;
    } else {
      b.addEventListener('click', (function(pg) {
        return function() { goPage(pg); };
      })(targetPg));
    }
    return b;
  }

  paginator.appendChild(mkBtn(svgFirst, cur === 1,          1));
  paginator.appendChild(mkBtn(svgPrev,  cur === 1,          cur - 1));
  var badge = document.createElement('span');
  badge.className = 'pg-current';
  badge.textContent = cur;
  paginator.appendChild(badge);
  paginator.appendChild(mkBtn(svgNext, cur === totalPages, cur + 1));
  paginator.appendChild(mkBtn(svgLast, cur === totalPages, totalPages));
}

function goPage(p) {
  currentPage = p;
  renderWithLoader();
  forceScrollTop();
}

/* ── LOADING INDICATOR ───────────────────────────────────────────────────── */

function showLoader() {
  if (!container) return;
  container.innerHTML =
    '<div style="padding:48px;text-align:center;font-family:var(--mono);' +
    'font-size:0.62rem;letter-spacing:0.1em;color:var(--text-3)">LOADING…</div>';
  if (paginator) paginator.innerHTML = '';
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN RENDER
   Dispatches to either the paginated "all" path or the flat section path.
   ══════════════════════════════════════════════════════════════════════════ */

async function render(posts, totalPages) {
  if (!container) return;

  var v = isMobile() ? 'list' : currentView;

  /* ── for-you: no pagination, show everything from the JSON ── */
  if (currentSection === 'for-you') {
    container.innerHTML = '';
    container.appendChild(v === 'grid' ? renderGrid(posts) : renderList(posts));
    if (paginator) paginator.innerHTML = '';
    return;
  }

  /* ── 'all': posts come pre-sliced from the page file, totalPages from index ── */
  if (currentSection === 'all') {
    container.innerHTML = '';
    container.appendChild(v === 'grid' ? renderGrid(posts) : renderList(posts));
    renderPaginator(totalPages || 1, currentPage);
    return;
  }

  /* ── flat sections: slice locally as before ── */
  var total = Math.max(1, Math.ceil(posts.length / PAGE_LIMIT));
  if (currentPage < 1)     currentPage = 1;
  if (currentPage > total) currentPage = total;

  var slice = posts.slice((currentPage - 1) * PAGE_LIMIT, currentPage * PAGE_LIMIT);
  container.innerHTML = '';
  container.appendChild(v === 'grid' ? renderGrid(slice) : renderList(slice));
  renderPaginator(total, currentPage);
}

/* ── RENDER WITH LOADER ──────────────────────────────────────────────────── */

async function renderWithLoader() {
  if (!container || loading) return;
  loading = true;
  showLoader();

  try {
    if (currentSection === 'all') {
      /* ── Paginated path ───────────────────────────────────────────────────
         1. Fetch the index to know how many pages exist.
         2. Clamp currentPage to valid range.
         3. Fetch only the page that is needed (served from cache if available).
         4. Pass totalPages to render() so the paginator is built correctly.
         The posts array arrives pre-sliced — no further slicing needed.
      ──────────────────────────────────────────────────────────────────── */
      var idx = await loadPostsIndex();

      if (currentPage < 1)                  currentPage = 1;
      if (currentPage > idx.total_pages)    currentPage = idx.total_pages;

      var posts = await loadPostsPage(currentPage);
      await render(posts, idx.total_pages);

    } else {
      /* ── Flat section path (unchanged from v2) ── */
      var sectionPosts = await loadSection(currentSection);
      await render(sectionPosts);
    }

    /* Sidebar uses posts-recent.json — loaded once, cached */
    var sidebarPosts = await loadSidebarPosts();
    renderPicks(sidebarPosts);
    renderTags(sidebarPosts);

  } catch (err) {
    console.error('[ZFX] renderWithLoader failed:', err);
  }

  loading = false;
}

/* ── SECTION MANAGEMENT ──────────────────────────────────────────────────── */

function setSection(sec) {
  if (SECTIONS.indexOf(sec) === -1) sec = 'for-you';
  currentSection = sec;
  currentPage    = 1;
  document.querySelectorAll('[data-section]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.section === sec);
  });
  renderWithLoader();
}

function handleHash() {
  var hash = window.location.hash.replace('#', '');
  setSection(SECTIONS.indexOf(hash) !== -1 ? hash : 'for-you');
}

/* ══════════════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function() {

  container      = document.getElementById('postsContainer');
  paginator      = document.getElementById('paginator');
  picksContainer = document.getElementById('picksContainer');
  tagsCloud      = document.getElementById('tagsCloud');
  btnGrid        = document.getElementById('btnGrid');
  btnList        = document.getElementById('btnList');
  sideMenu       = document.getElementById('sideMenu');
  menuOverlay    = document.getElementById('menuOverlay');

  loadTicker();

  /* ── Theme toggle ── */
  var htmlEl     = document.documentElement;
  var themeBtn   = document.getElementById('themeBtn');
  var menuToggle = document.getElementById('menuThemeToggle');
  var menuText   = document.getElementById('menuThemeText');
  var savedTheme = localStorage.getItem('zfx-theme');
  if (savedTheme) htmlEl.setAttribute('data-theme', savedTheme);

  function applyTheme(t) {
    htmlEl.setAttribute('data-theme', t);
    localStorage.setItem('zfx-theme', t);
    if (menuText) menuText.textContent = t === 'dark' ? 'Switch to Light' : 'Switch to Dark';
  }
  applyTheme(htmlEl.getAttribute('data-theme') || 'dark');

  if (themeBtn)   themeBtn.addEventListener('click',   function() { applyTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); });
  if (menuToggle) menuToggle.addEventListener('click', function() { applyTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); });

  /* ── Side menu ── */
  function openMenu()  { sideMenu?.classList.add('open');    menuOverlay?.classList.add('open');    document.body.style.overflow = 'hidden'; }
  function closeMenu() { sideMenu?.classList.remove('open'); menuOverlay?.classList.remove('open'); document.body.style.overflow = ''; }

  document.getElementById('hamburgerBtn')?.addEventListener('click', openMenu);
  menuOverlay?.addEventListener('click', closeMenu);

  if (!container) return;

  /* ── View toggle (re-renders from cache, no refetch) ── */
  if (btnGrid) btnGrid.addEventListener('click', function() {
    currentView = 'grid'; currentPage = 1;
    btnGrid.classList.add('active'); btnList.classList.remove('active');
    /* For 'all', re-render from the page cache (no network hit) */
    if (currentSection === 'all') {
      var cached = POSTS_PAGE_CACHE[currentPage];
      var totalPg = POSTS_INDEX ? POSTS_INDEX.total_pages : 1;
      if (cached !== undefined) render(cached, totalPg);
    } else {
      var flatCached = CACHE[currentSection];
      if (flatCached) render(flatCached);
    }
  });
  if (btnList) btnList.addEventListener('click', function() {
    currentView = 'list'; currentPage = 1;
    btnList.classList.add('active'); btnGrid.classList.remove('active');
    if (currentSection === 'all') {
      var cached = POSTS_PAGE_CACHE[currentPage];
      var totalPg = POSTS_INDEX ? POSTS_INDEX.total_pages : 1;
      if (cached !== undefined) render(cached, totalPg);
    } else {
      var flatCached = CACHE[currentSection];
      if (flatCached) render(flatCached);
    }
  });

  window.addEventListener('hashchange', handleHash);

  document.querySelectorAll('[data-section]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      history.pushState(null, '', '#' + el.dataset.section);
      setSection(el.dataset.section);
      forceScrollTop();
      closeMenu();
    });
  });

  document.querySelectorAll('.footer-link').forEach(function(el) {
    el.addEventListener('click', function(e) {
      var sec = (el.getAttribute('href') || '').replace('#', '');
      if (SECTIONS.indexOf(sec) !== -1) {
        e.preventDefault();
        history.pushState(null, '', '#' + sec);
        setSection(sec);
        forceScrollTop();
      }
    });
  });

  var rt;
  window.addEventListener('resize', function() {
    clearTimeout(rt);
    rt = setTimeout(function() {
      /* Re-render currently visible content from cache on resize */
      if (currentSection === 'all') {
        var cached = POSTS_PAGE_CACHE[currentPage];
        var totalPg = POSTS_INDEX ? POSTS_INDEX.total_pages : 1;
        if (cached !== undefined) render(cached, totalPg);
      } else {
        var flatCached = CACHE[currentSection];
        if (flatCached) render(flatCached);
      }
    }, 120);
  });

  /* ── Bootstrap ──────────────────────────────────────────────────────────
     Load the initial data needed before first render:
       • for-you.json   → first section shown on landing
       • posts-index.json → pagination metadata (prefetch so 'all' is instant)
       • posts-recent.json → sidebar picks + tag cloud
     All three fire in parallel to minimise time-to-interactive.
  ──────────────────────────────────────────────────────────────────────── */
  (async function boot() {
    if (!container) return;
    showLoader();
    try {
      await Promise.all([
        loadSection('for-you'),   /* for the default view */
        loadPostsIndex(),         /* prefetch pagination metadata */
        loadSidebarPosts()        /* picks + tag cloud */
      ]);

      var sidebarPosts = CACHE['_sidebar'] || [];
      renderPicks(sidebarPosts);
      renderTags(sidebarPosts);

      handleHash();   /* decide section from URL hash and render */

    } catch (err) {
      console.error('[ZFX] Boot failed:', err);
      if (container) {
        container.innerHTML =
          '<p style="color:var(--text-3);padding:32px;font-family:var(--mono);font-size:0.65rem;letter-spacing:0.08em;">' +
          'FAILED TO LOAD POSTS — CHECK /data/for-you.json</p>';
      }
    }
  })();

});