/* ============================================================
   ZureFX — projects.js  (v3)
   Carga desde data/research.json (proyectos).

   CAMBIO v3
   ---------
   Ya no intenta usar CACHE['all'] ni loadSection('all') porque
   la sección 'all' ahora es paginada (data/post/post-N.json) y
   no está disponible como array plano en memoria.
   Fuente de datos: data/research.json siempre.
   ============================================================ */

function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showSkeleton(container) {
  container.innerHTML =
    '<div class="proj-skel-group">' +
      '<div class="proj-skel-heading"></div>' +
      '<div class="proj-skel-card"></div>' +
      '<div class="proj-skel-card"></div>' +
    '</div>' +
    '<div class="proj-skel-group">' +
      '<div class="proj-skel-heading"></div>' +
      '<div class="proj-skel-card"></div>' +
    '</div>';
}

function renderStats(projects) {
  var el = document.getElementById('projStats');
  if (!el) return;

  var cats = [];
  projects.forEach(p => {
    if (p.subsection && !cats.includes(p.subsection)) cats.push(p.subsection);
  });

  var picks = projects.filter(p => p.pick === 1 || p.pick === true).length;

  var html =
    '<span class="proj-stat">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>' +
      '</svg>' +
      projects.length + ' project' + (projects.length !== 1 ? 's' : '') +
    '</span>' +
    '<span class="proj-stat">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>' +
        '<line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>' +
        '<line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>' +
      '</svg>' +
      cats.length + ' categor' + (cats.length !== 1 ? 'ies' : 'y') +
    '</span>';

  if (picks) {
    html +=
      '<span class="proj-stat proj-stat-pick">' +
        '<svg viewBox="0 0 24 24" fill="currentColor">' +
          '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' +
        '</svg>' +
        picks + ' pick' + (picks !== 1 ? 's' : '') +
      '</span>';
  }

  el.innerHTML = html;
}

function buildCard(p) {
  var isExt = p.permalink && p.permalink.startsWith('http');
  var isPick = p.pick === 1 || p.pick === true;
  var desc = p.description || '';
  var btnLabel = p.btn_label || 'View Project';

  var featuresHTML = '';
  if (Array.isArray(p.features) && p.features.length) {
    featuresHTML =
      '<ul class="proj-card-features">' +
      p.features.map(f => '<li>' + esc(f) + '</li>').join('') +
      '</ul>';
  }

  var tagsHTML = '';
  if (Array.isArray(p.tags) && p.tags.length) {
    tagsHTML =
      '<div class="proj-card-tags">' +
      p.tags.map(t => '<span class="proj-card-tag">' + esc(t) + '</span>').join('') +
      '</div>';
  }

  var pickHTML = isPick
    ? '<span class="proj-pick-badge">' +
        '<svg viewBox="0 0 24 24" fill="currentColor">' +
          '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' +
        '</svg>Pick</span>'
    : '';

  return (
    '<div class="proj-card' + (isPick ? ' proj-card-pick' : '') + '">' +
      '<div class="proj-card-header">' +
        '<h3 class="proj-card-title">' + esc(p.title || '') + '</h3>' +
        pickHTML +
      '</div>' +
      (desc ? '<p class="proj-card-desc">' + esc(desc) + '</p>' : '') +
      featuresHTML +
      '<div class="proj-card-footer">' +
        tagsHTML +
        '<a href="' + esc(p.permalink || '#') + '" class="proj-card-btn"' +
          (isExt ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
          btnLabel +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
            (isExt
              ? '<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>' +
                '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'
              : '<polyline points="9 18 15 12 9 6"/>') +
          '</svg>' +
        '</a>' +
      '</div>' +
    '</div>'
  );
}

function groupBySubsection(projects) {
  const groups = new Map();
  projects.forEach(p => {
    const key = p.subsection || 'Projects';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return groups;
}

/* ══════════════════════════════════════════════════════════════════════════
   LOAD PROJECTS
   Fuente única: data/research.json
   Filtra por section === 'projects'.

   No usa CACHE['all'] ni loadSection('all') porque 'all' es ahora
   paginado y no está disponible como array completo en memoria.
   ══════════════════════════════════════════════════════════════════════════ */
function loadProjects() {
  /* Reutilizar caché de research.json si loadSection ya lo tiene */
  if (typeof CACHE !== 'undefined' && Array.isArray(CACHE['research']) && CACHE['research'].length) {
    console.log('[ZFX] projects — usando CACHE[research]');
    return Promise.resolve(
      CACHE['research'].filter(p => String(p.section || '').toLowerCase() === 'projects')
    );
  }

  /* loadSection('research') si está disponible */
  if (typeof loadSection === 'function') {
    return loadSection('research').then(posts =>
      posts.filter(p => String(p.section || '').toLowerCase() === 'projects')
    );
  }

  /* Fetch directo como fallback */
  const url = getRootPrefix() + 'data/research.json?v=' + Date.now();
  return fetch(url, { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data =>
      Array.isArray(data)
        ? data.filter(p => String(p.section || '').toLowerCase() === 'projects')
        : []
    )
    .catch(err => {
      console.warn('[projects.js] Could not load research.json:', err);
      return [];
    });
}

/* ── BOOT ── */
(async function () {
  const container = document.getElementById('projectsContainer');
  if (!container) return;

  showSkeleton(container);

  let projects;
  try {
    projects = await loadProjects();
    console.log('[ZFX] projects — ' + projects.length + ' projects encontrados');
  } catch (err) {
    console.error('[projects.js]', err);
    container.innerHTML = '<div class="proj-empty"><h3>Could not load projects</h3></div>';
    return;
  }

  renderStats(projects);

  if (!projects.length) {
    container.innerHTML =
      '<div class="proj-empty">' +
        '<h3>No projects yet</h3>' +
      '</div>';
    return;
  }

  const groups = groupBySubsection(projects);
  let html = '';
  groups.forEach((items, name) => {
    const cards = items.map(buildCard).join('');
    html +=
      '<div class="proj-section">' +
        '<div class="proj-section-heading">' +
          '<div class="proj-section-left">' +
            '<span class="proj-section-dot"></span>' +
            '<span class="proj-section-label">' + esc(name) + '</span>' +
          '</div>' +
          '<span class="proj-section-count">' + items.length + ' project' + (items.length !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        '<div class="proj-cards">' + cards + '</div>' +
      '</div>';
  });

  container.innerHTML = html;
})();