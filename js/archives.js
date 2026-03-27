/* ============================================================
   ZureFX — archives.js  (v4)
   Carga desde data/posts-recent.json (últimos ~50 posts).
   Si no existe, cae a data/posts.json como fallback.
   Reutiliza CACHE de app.js cuando está disponible.
   Depende de app.js: getRootPrefix(), SECTION_COLOR_MAP,
                      fmtDate(), capitalize(), CACHE.
   ============================================================ */

/* ── Helpers ── */
function escArc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function monthKey(d) { return d.slice(0, 7); }

function formatMonthHeading(key) {
  try {
    var p = key.split('-').map(Number);
    return new Date(p[0], p[1]-1, 1)
      .toLocaleDateString('en-US', { month:'long', year:'numeric' })
      .toUpperCase();
  } catch(_) { return key; }
}

/* ── Build compact row ── */
function buildArcRow(p) {
  var color = SECTION_COLOR_MAP[p.section] || '#cc2b2b';
  var label = capitalize(p.section);
  var words = p.words ? p.words.toLocaleString() + ' w' : '— w';
  var time  = p.readTime || '? min';

  var item = document.createElement('div');
  item.style.cssText = [
    'display:flex', 'align-items:flex-start', 'gap:14px',
    'padding:14px 16px',
    'background:var(--bg-card)',
    'cursor:pointer',
    'animation:fadeInUp .3s ease both'
  ].join(';');

  var bar = document.createElement('div');
  bar.style.cssText = [
    'flex-shrink:0', 'width:3px', 'border-radius:2px',
    'background:' + color, 'align-self:stretch', 'min-height:44px'
  ].join(';');

  var body = document.createElement('div');
  body.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px';

  var meta = document.createElement('div');
  meta.style.cssText = 'display:flex;align-items:center;gap:8px';
  meta.innerHTML =
    '<span style="font-family:var(--mono);font-size:.5rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:' + color + ';display:flex;align-items:center;gap:4px;line-height:1">' +
      '<span style="width:4px;height:4px;border-radius:50%;background:currentColor;flex-shrink:0;display:block"></span>' +
      escArc(label) +
    '</span>' +
    '<span style="font-family:var(--mono);font-size:.48rem;color:var(--text-3);margin-left:auto">' +
      fmtDate(p.date) +
    '</span>';

  var title = document.createElement('div');
  title.style.cssText = 'font-family:var(--display);font-weight:700;font-size:.95rem;color:var(--text-1);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s';
  title.textContent = p.title;

  var desc = document.createElement('div');
  desc.style.cssText = 'font-family:var(--body);font-size:.72rem;color:var(--text-2);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden';
  desc.textContent = p.description || '';

  var foot = document.createElement('div');
  foot.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:2px';
  foot.innerHTML =
    '<span style="font-family:var(--mono);font-size:.52rem;color:var(--text-3);display:flex;align-items:center;gap:3px">' +
      '<svg style="width:10px;height:10px;opacity:.5;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
      words +
    '</span>' +
    '<span style="width:3px;height:3px;border-radius:50%;background:var(--border);flex-shrink:0"></span>' +
    '<span style="font-family:var(--mono);font-size:.52rem;color:var(--text-3);display:flex;align-items:center;gap:3px">' +
      '<svg style="width:10px;height:10px;opacity:.5;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      time +
    '</span>';

  body.appendChild(meta);
  body.appendChild(title);
  body.appendChild(desc);
  body.appendChild(foot);
  item.appendChild(bar);
  item.appendChild(body);

  item.addEventListener('mouseenter', function() {
    item.style.borderColor = 'rgba(' + parseInt(color.slice(1,3),16) + ',' + parseInt(color.slice(3,5),16) + ',' + parseInt(color.slice(5,7),16) + ',.35)';
    item.style.transform   = 'translateY(-1px)';
    title.style.color      = color;
  });
  item.addEventListener('mouseleave', function() {
    item.style.borderColor = '';
    item.style.transform   = '';
    title.style.color      = '';
  });
  item.addEventListener('click', (function(href) {
    return function() { window.location.href = href; };
  })(p.permalink));

  return item;
}

/* ── Skeleton ── */
function renderSkeletonArc(container) {
  container.innerHTML =
    '<div class="arc-skeleton-group"><div class="arc-skeleton-heading"></div>' +
    '<div class="arc-skeleton-row"></div><div class="arc-skeleton-row"></div><div class="arc-skeleton-row"></div></div>' +
    '<div class="arc-skeleton-group"><div class="arc-skeleton-heading"></div>' +
    '<div class="arc-skeleton-row"></div><div class="arc-skeleton-row"></div></div>';
}

function updateArchivesStats(text) {
  var el = document.getElementById('archivesTotal');
  if (el) el.querySelector('span').textContent = text;
}

/* ══════════════════════════════════════════════════════
   LOAD — 3 niveles de prioridad
   1. CACHE['all'] de app.js → cero fetch
   2. posts-recent.json     → archivo ligero (~50 posts)
   3. posts.json            → fallback completo
   ══════════════════════════════════════════════════════ */
function loadRecentPosts() {
  /* Nivel 1: reutilizar CACHE de app.js si ya está en memoria */
  if (typeof CACHE !== 'undefined' && Array.isArray(CACHE['all']) && CACHE['all'].length) {
    console.log('[ZFX] archives — usando CACHE[all]');
    return Promise.resolve(CACHE['all'].slice(0, 50));
  }

  var prefix = getRootPrefix();

  /* Nivel 2: posts-recent.json (archivo ligero, solo últimos ~50) */
  return fetch(prefix + 'data/posts-recent.json?v=' + Date.now(), { cache: 'no-store' })
    .then(function(res) {
      if (!res.ok) throw new Error('no-recent');
      return res.json();
    })
    .then(function(data) {
      console.log('[ZFX] archives — loaded posts-recent.json');
      return Array.isArray(data) ? data : [];
    })
    .catch(function() {
      /* Nivel 3: fallback a posts.json completo */
      console.warn('[ZFX] archives — posts-recent.json no encontrado, usando posts.json');
      return fetch(prefix + 'data/posts.json?v=' + Date.now(), { cache: 'no-store' })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function(data) {
          return Array.isArray(data) ? data.slice(0, 50) : [];
        })
        .catch(function(err) {
          console.warn('[archives.js] Could not load posts.json:', err);
          return [];
        });
    });
}

/* ── Main ── */
async function loadArchives() {
  var container = document.getElementById('archivesContainer');
  if (!container) return;

  renderSkeletonArc(container);

  try {
    var allPosts = await loadRecentPosts();

    var posts = allPosts
      .filter(function(p) { return p.section !== 'projects'; })
      .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    updateArchivesStats(posts.length + ' post' + (posts.length !== 1 ? 's' : ''));

    if (!posts.length) {
      container.innerHTML = '<div class="archives-empty"><h3>No posts yet</h3><p>Check back soon.</p></div>';
      return;
    }

    /* Agrupar por mes */
    var groupMap = new Map();
    posts.forEach(function(p) {
      var key = monthKey(p.date);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(p);
    });

    var frag = document.createDocumentFragment();

    groupMap.forEach(function(groupPosts, key) {
      var group = document.createElement('div');
      group.className = 'archive-group';

      var heading = document.createElement('div');
      heading.className = 'archive-month-heading';
      heading.innerHTML =
        '<div class="archive-month-left">' +
          '<span class="archive-month-dot"></span>' +
          '<span class="archive-month-label">' + formatMonthHeading(key) + '</span>' +
        '</div>' +
        '<span class="archive-month-count">' +
          groupPosts.length + ' post' + (groupPosts.length !== 1 ? 's' : '') +
        '</span>';

      var list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:6px';

      groupPosts.forEach(function(p) { list.appendChild(buildArcRow(p)); });

      group.appendChild(heading);
      group.appendChild(list);
      frag.appendChild(group);
    });

    container.innerHTML = '';
    container.appendChild(frag);

  } catch (err) {
    console.error('[archives.js]', err);
    container.innerHTML =
      '<div class="archives-empty"><h3>Could not load archives</h3>' +
      '<p>Check that <code>/data/posts-recent.json</code> exists.</p></div>';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadArchives);
} else {
  loadArchives();
}