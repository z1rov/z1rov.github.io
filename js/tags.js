/* ============================================================
   ZureFX — tags.js  (v6)
   - Índice (tags.html)       → solo tag cloud (pills), sin posts
   - Filtro  (tags.html#tag)  → lista posts del tag seleccionado

   NEW DATA ARCHITECTURE (v6)
   --------------------------
   Previously everything lived in a single data/tags.json:
     { "ctf": [post1, post2], "linux": [post1] }

   Now tags are split into separate files for scalability:

     data/tags/index.json        → { "ctf": 54, "linux": 32 }  (counts only)
     data/tags/tag-ctf.json      → [ post1, post2, ... ]        (posts on demand)
     data/tags/tag-linux.json    → [ post1, ... ]

   This means:
   • The tag cloud loads a tiny index file (~1–2 KB) instead of megabytes.
   • Tag post lists are fetched only when the user actually opens a tag.
   • Already-fetched tag files are cached in memory to avoid repeat requests.

   Depende de app.js: getRootPrefix(), SECTION_COLOR_MAP,
   fmtDate(), capitalize().
   ============================================================ */

/* ── Index cache: populated once from data/tags/index.json ── */
var _tags_index  = null;   // { "ctf": 54, "linux": 32, … }
var _tags_loaded = false;

/* ── Per-tag post cache: populated on demand ─────────────────
   _tag_cache["ctf"] = [ post1, post2, … ]
   Avoids re-fetching the same tag file when navigating back. */
var _tag_cache = {};

function escT(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════════
   LOAD INDEX
   Fetches data/tags/index.json — contains tag counts only.
   Shape: { "ctf": 54, "linux": 32, "reversing": 12 }
   ══════════════════════════════════════════════════ */
function tagsLoadIndex() {
  if (_tags_loaded) return Promise.resolve(_tags_index);

  /* New path: data/tags/index.json (was: data/tags.json) */
  var url = getRootPrefix() + 'data/tags/index.json?v=' + Date.now();
  return fetch(url, { cache: 'no-store' })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      _tags_index  = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
      _tags_loaded = true;
      console.log('[ZFX] tags index — ' + Object.keys(_tags_index).length + ' tags');
      return _tags_index;
    })
    .catch(function(err) {
      console.warn('[tags.js] Could not load tags/index.json:', err);
      _tags_index  = {};
      _tags_loaded = true;
      return {};
    });
}

/* ══════════════════════════════════════════════════
   LOAD TAG FILE
   Fetches data/tags/tag-<slug>.json on demand.
   Returns a Promise<Array> of post objects.

   Caching strategy:
   • Check _tag_cache[slug] first — return instantly if found.
   • Otherwise fetch data/tags/tag-<slug>.json and store result.
   • A failed fetch stores an empty array so we don't retry endlessly.
   ══════════════════════════════════════════════════ */
function tagsLoadTag(slug) {
  /* Return cached result immediately if available */
  if (Object.prototype.hasOwnProperty.call(_tag_cache, slug)) {
    return Promise.resolve(_tag_cache[slug]);
  }

  /* Build the per-tag file URL: data/tags/tag-ctf.json */
  var url = getRootPrefix() + 'data/tags/tag-' + encodeURIComponent(slug) + '.json?v=' + Date.now();

  return fetch(url, { cache: 'no-store' })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var posts = Array.isArray(data) ? data : [];
      _tag_cache[slug] = posts;   /* Store in memory cache */
      console.log('[ZFX] tag "' + slug + '" — ' + posts.length + ' posts loaded');
      return posts;
    })
    .catch(function(err) {
      console.warn('[tags.js] Could not load tag file for "' + slug + '":', err);
      _tag_cache[slug] = [];      /* Cache empty result to avoid repeated failing fetches */
      return [];
    });
}

/* ── helpers ── */
function getHashTag() {
  var raw = location.hash.slice(1).trim();
  return raw ? decodeURIComponent(raw) : '';
}

function updateTagsStats(text) {
  var el = document.getElementById('tagsTotal');
  if (el) el.querySelector('span').textContent = text;
}

function renderTagsSkeleton(container) {
  container.innerHTML =
    '<div class="tag-skeleton-group">' +
      '<div class="tag-skeleton-heading"></div>' +
      '<div class="tag-skeleton-row"></div>' +
    '</div>';
}

/* ══════════════════════════════════════════════════
   BUILD POST ROW (solo en modo filtro)
   Unchanged from v5 — only data loading changed.
   ══════════════════════════════════════════════════ */
function buildPlItemT(p) {
  var color = SECTION_COLOR_MAP[p.section] || '#cc2b2b';
  var label = capitalize(p.section);
  var words = p.words ? p.words.toLocaleString() + ' w' : '';
  var time  = p.readTime ? p.readTime : '? min';

  var item = document.createElement('div');
  item.className = 'tag-row';
  item.style.cssText = [
    'display:flex','align-items:flex-start','gap:14px',
    'padding:14px 16px','background:var(--bg-card)',
    'cursor:pointer','animation:fadeInUp .3s ease both'
  ].join(';');

  var bar = document.createElement('div');
  bar.style.cssText = [
    'flex-shrink:0','width:3px','border-radius:2px',
    'background:'+color,'align-self:stretch','min-height:44px'
  ].join(';');

  var body = document.createElement('div');
  body.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px';

  var meta = document.createElement('div');
  meta.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
  meta.innerHTML =
    '<span style="font-family:var(--mono);font-size:.5rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:'+color+';display:flex;align-items:center;gap:4px;line-height:1">' +
      '<span style="width:4px;height:4px;border-radius:50%;background:currentColor;flex-shrink:0;display:block"></span>' +
      escT(label) +
    '</span>' +
    '<span style="font-family:var(--mono);font-size:.48rem;color:var(--text-3);margin-left:auto">' + fmtDate(p.date) + '</span>';

  var title = document.createElement('div');
  title.style.cssText = [
    'font-family:var(--display)','font-weight:700','font-size:.95rem',
    'color:var(--text-1)','line-height:1.25',
    'white-space:nowrap','overflow:hidden','text-overflow:ellipsis',
    'transition:color .15s'
  ].join(';');
  title.textContent = p.title;

  var desc = document.createElement('div');
  desc.style.cssText = [
    'font-family:var(--body)','font-size:.72rem',
    'color:var(--text-2)','line-height:1.5',
    'display:-webkit-box','-webkit-line-clamp:2',
    '-webkit-box-orient:vertical','overflow:hidden'
  ].join(';');
  desc.textContent = p.description || '';

  var footParts =
    '<span style="font-family:var(--mono);font-size:.52rem;color:var(--text-3);display:flex;align-items:center;gap:3px">' +
      '<svg style="width:10px;height:10px;opacity:.5;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      time +
    '</span>';

  if (words) {
    footParts =
      '<span style="font-family:var(--mono);font-size:.52rem;color:var(--text-3);display:flex;align-items:center;gap:3px">' +
        '<svg style="width:10px;height:10px;opacity:.5;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        words +
      '</span>' +
      '<span style="width:3px;height:3px;border-radius:50%;background:var(--border);flex-shrink:0"></span>' +
      footParts;
  }

  var foot = document.createElement('div');
  foot.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:2px';
  foot.innerHTML = footParts;

  body.appendChild(meta);
  body.appendChild(title);
  if (p.description) body.appendChild(desc);
  body.appendChild(foot);
  item.appendChild(bar);
  item.appendChild(body);

  item.addEventListener('mouseenter', function() {
    item.style.transform = 'translateY(-1px)';
    title.style.color    = color;
  });
  item.addEventListener('mouseleave', function() {
    item.style.transform = '';
    title.style.color    = '';
  });
  item.addEventListener('click', (function(href) {
    return function() { window.location.href = href; };
  })(p.permalink));

  return item;
}

/* ══════════════════════════════════════════════════
   MODO FILTRO — tags.html#ctf
   Fetches data/tags/tag-<slug>.json on demand.
   The index is still loaded first (usually already cached)
   to resolve the canonical slug casing.
   ══════════════════════════════════════════════════ */
async function renderFilter(tag, container) {
  document.title = '#' + tag + ' — ZureFX';

  var header = document.getElementById('tagsHeader');
  if (header) {
    header.innerHTML =
      '<div class="tags-header-top">' +
        '<div>' +
          '<a href="tags.html" class="tags-back">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>' +
            'All tags' +
          '</a>' +
          '<p class="tags-eyebrow">Tag</p>' +
          '<h1 class="tags-title"># <em>' + escT(tag) + '</em></h1>' +
          '<p class="tags-subtitle">Posts tagged with this topic.</p>' +
        '</div>' +
        '<div class="tags-stats"><span class="tags-stat" id="tagsTotal">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>' +
          '<span>loading…</span>' +
        '</span></div>' +
      '</div>';
  }

  renderTagsSkeleton(container);

  /* Load the index to resolve the canonical slug (handles casing mismatches) */
  var index = await tagsLoadIndex();
  var tagKey = Object.keys(index).find(function(k) {
    return k.toLowerCase() === tag.toLowerCase();
  }) || tag.toLowerCase();

  /* Fetch the per-tag file — returns from cache if previously loaded */
  var posts = await tagsLoadTag(tagKey);

  updateTagsStats(posts.length + ' post' + (posts.length !== 1 ? 's' : ''));

  if (!posts.length) {
    container.innerHTML =
      '<div class="tags-empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
          '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' +
        '</svg>' +
        '<h3>No posts found</h3>' +
        '<p>No posts tagged <strong>#' + escT(tag) + '</strong> yet.</p>' +
      '</div>';
    return;
  }

  var list = document.createElement('div');
  list.className = 'tag-post-list';
  list.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  posts.forEach(function(p) { list.appendChild(buildPlItemT(p)); });
  container.innerHTML = '';
  container.appendChild(list);
}

/* ══════════════════════════════════════════════════
   MODO ÍNDICE — tags.html (solo pills, sin posts)
   Uses index.json counts directly.

   KEY CHANGE from v5:
   Previously index[tag] was an array, so count = entry[1].length
   Now index[tag] is a number,          so count = entry[1]
   ══════════════════════════════════════════════════ */
function renderIndex(index, container) {
  var entries = Object.entries(index);

  document.title = 'Tags — ZureFX';
  updateTagsStats(entries.length + ' tag' + (entries.length !== 1 ? 's' : ''));

  var cloud = document.createElement('div');
  cloud.className = 'tags-cloud';

  entries.forEach(function(entry) {
    var tg = entry[0];
    /* entry[1] is now a plain number (post count), not an array */
    var count = typeof entry[1] === 'number' ? entry[1] : (Array.isArray(entry[1]) ? entry[1].length : 0);

    var btn = document.createElement('a');
    btn.className   = 'tags-cloud-pill';
    btn.dataset.tag = tg;
    btn.href        = 'tags.html#' + encodeURIComponent(tg);
    btn.innerHTML   = escT(tg) + '<span class="pill-count">' + count + '</span>';
    cloud.appendChild(btn);
  });

  container.innerHTML = '';
  container.appendChild(cloud);
}

/* ══════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════ */
async function renderTagsPage() {
  var container = document.getElementById('tagsContainer');
  if (!container) return;

  var tag = getHashTag();
  renderTagsSkeleton(container);

  try {
    var index = await tagsLoadIndex();

    if (tag) {
      await renderFilter(tag, container);
    } else {
      renderIndex(index, container);
    }
  } catch (e) {
    console.error('[tags.js]', e);
    container.innerHTML =
      '<div class="tags-empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
          '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' +
        '</svg>' +
        '<h3>Could not load tags</h3>' +
        '<p>Check that <code>/data/tags/index.json</code> exists and is valid JSON.</p>' +
      '</div>';
  }
}

/* ── hashchange (navegar entre índice y filtro sin recargar) ── */
window.addEventListener('hashchange', renderTagsPage);

/* ── arranque ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderTagsPage);
} else {
  renderTagsPage();
}