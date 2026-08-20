// Author: z1rov

var _tags_index  = null;
var _tags_loaded = false;

var _tag_cache = {};

function escT(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function slugifyTag(s) {
  return String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '-');
}

function tagKeyNorm(s) {
  return String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '');
}

function tagsLoadIndex() {
  if (_tags_loaded) return Promise.resolve(_tags_index);

  var url = getRootPrefix() + 'data/tags/index.json?v=' + Date.now();
  return fetch(url, { cache: 'no-store' })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      _tags_index  = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
      _tags_loaded = true;
      console.log('tags index — ' + Object.keys(_tags_index).length + ' tags');
      return _tags_index;
    })
    .catch(function(err) {
      console.warn('Could not load tags/index.json:', err);
      _tags_index  = {};
      _tags_loaded = true;
      return {};
    });
}

function tagsLoadTag(rawSlug) {
  var slug = slugifyTag(rawSlug);

  if (Object.prototype.hasOwnProperty.call(_tag_cache, slug)) {
    return Promise.resolve(_tag_cache[slug]);
  }

  var url = getRootPrefix() + 'data/tags/tag-' + encodeURIComponent(slug) + '.json?v=' + Date.now();

  return fetch(url, { cache: 'no-store' })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var posts = Array.isArray(data) ? data : [];
      _tag_cache[slug] = posts;
      console.log('tag "' + slug + '" — ' + posts.length + ' posts loaded');
      return posts;
    })
    .catch(function(err) {
      console.warn('Could not load tag file for "' + slug + '":', err);
      _tag_cache[slug] = [];
      return [];
    });
}

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

function tagsDefaultHeaderHTML() {
  return '' +
    '<div class="tags-header-top">' +
      '<div>' +
        '<p class="tags-eyebrow">Browse</p>' +
        '<h1 class="tags-title">Ta<em>gs</em></h1>' +
        '<p class="tags-subtitle">Posts organized by topic.</p>' +
      '</div>' +
      '<div class="tags-stats" id="tagsStats"><span class="tags-stat" id="tagsTotal">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>' +
        '<span>loading…</span>' +
      '</span></div>' +
    '</div>' +
    '<div class="tags-controls">' +
      '<div class="tags-search-wrap">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
        '<input type="search" id="tags-search" class="tags-search-input" placeholder="Search tags..." autocomplete="off" />' +
      '</div>' +
    '</div>';
}

function attachTagsSearch() {
  var input = document.getElementById('tags-search');
  if (!input) return;
  input.value = '';
  input.addEventListener('input', function() {
    filterTagsCloud(input.value);
  });
}

function filterTagsCloud(query) {
  var q = tagKeyNorm(query);
  var pills = document.querySelectorAll('.tags-cloud-pill');
  var visible = 0;

  pills.forEach(function(pill) {
    var tag = tagKeyNorm(pill.dataset.tag || '');
    var match = !q || tag.indexOf(q) !== -1;
    pill.style.display = match ? '' : 'none';
    if (match) visible++;
  });

  var empty = document.getElementById('tagsCloudEmpty');
  if (empty) empty.style.display = visible ? 'none' : 'flex';

  updateTagsStats(visible + ' tag' + (visible !== 1 ? 's' : ''));
}

async function renderFilter(tag, container) {
  document.title = '#' + tag + ' | z1rov';

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

  var index = await tagsLoadIndex();
  var tagKey = Object.keys(index).find(function(k) {
    return tagKeyNorm(k) === tagKeyNorm(tag);
  }) || tag;

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

function renderIndex(index, container) {
  var entries = Object.entries(index);

  document.title = 'Tags | z1rov';

  var header = document.getElementById('tagsHeader');
  if (header) header.innerHTML = tagsDefaultHeaderHTML();

  updateTagsStats(entries.length + ' tag' + (entries.length !== 1 ? 's' : ''));
  attachTagsSearch();

  var wrap = document.createElement('div');
  wrap.className = 'tags-cloud-wrap';

  var cloud = document.createElement('div');
  cloud.className = 'tags-cloud';

  entries.forEach(function(entry) {
    var tg = entry[0];
    var count = typeof entry[1] === 'number' ? entry[1] : (Array.isArray(entry[1]) ? entry[1].length : 0);

    var btn = document.createElement('a');
    btn.className   = 'tags-cloud-pill';
    btn.dataset.tag = tg;
    btn.href        = 'tags.html#' + encodeURIComponent(slugifyTag(tg));
    btn.innerHTML   = escT(tg) + '<span class="pill-count">' + count + '</span>';
    cloud.appendChild(btn);
  });

  var empty = document.createElement('div');
  empty.className = 'tags-empty';
  empty.id = 'tagsCloudEmpty';
  empty.style.display = 'none';
  empty.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
      '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>' +
    '</svg>' +
    '<h3>No tags found</h3>' +
    '<p>Try a different search term.</p>';

  wrap.appendChild(cloud);
  wrap.appendChild(empty);

  container.innerHTML = '';
  container.appendChild(wrap);
}

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
    console.error(e);
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

window.addEventListener('hashchange', renderTagsPage);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderTagsPage);
} else {
  renderTagsPage();
}