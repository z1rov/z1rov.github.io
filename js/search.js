// Author: z1rov

(function () {
  'use strict';

  var _s_posts      = [];
  var _s_page       = 0;
  var _s_totalPages = null;
  var _s_loaded     = false;
  var _s_loading    = false;

  var isOpen        = false;
  var selectedIdx   = -1;
  var currentQuery  = '';
  var debounceTimer = null;

  var overlay, modal, input, resultsEl;

  document.addEventListener('DOMContentLoaded', function() {
    buildModal();
    bindTriggers();
    preloadFirstPage();
  });

  async function loadPostsIndex() {
    if (_s_totalPages !== null) return _s_totalPages;

    if (typeof POSTS_INDEX !== 'undefined' && POSTS_INDEX && POSTS_INDEX.total_pages) {
      _s_totalPages = POSTS_INDEX.total_pages;
      return _s_totalPages;
    }

    try {
      var url = getRootPrefix() + 'data/posts-index.json?v=' + Date.now();
      var res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      _s_totalPages = data.total_pages || 1;
    } catch (e) {
      console.warn('[search.js] Could not load posts-index.json:', e);
      _s_totalPages = 1;
    }

    return _s_totalPages;
  }

  async function loadNextPage() {
    if (_s_loaded || _s_loading) return [];

    var totalPages = await loadPostsIndex();

    if (_s_page >= totalPages) {
      _s_loaded = true;
      return [];
    }

    _s_loading = true;
    var nextPage = _s_page + 1;
    var url = getRootPrefix() + 'data/post/post-' + nextPage + '.json?v=' + Date.now();

    try {
      var res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { _s_loaded = true; _s_loading = false; return []; }

      var incoming = await res.json();
      if (!Array.isArray(incoming) || !incoming.length) {
        _s_loaded = true; _s_loading = false; return [];
      }

      var existing = {};
      _s_posts.forEach(function(p) { if (p.id) existing[p.id] = true; });
      var unique = incoming.filter(function(p) { return !p.id || !existing[p.id]; });

      _s_posts   = _s_posts.concat(unique);
      _s_page    = nextPage;
      _s_loading = false;

      if (nextPage >= totalPages) _s_loaded = true;

      return unique;
    } catch (e) {
      _s_loaded = true; _s_loading = false; return [];
    }
  }

  function preloadFirstPage() {
    loadNextPage().catch(function() {});
  }

  async function loadAllPages() {
    while (!_s_loaded) {
      var added = await loadNextPage();
      if (!added.length) break;
    }
  }

  function buildModal() {
    overlay = document.createElement('div');
    overlay.id = 'search-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    modal = document.createElement('div');
    modal.id = 'search-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Search posts');

    var header = document.createElement('div');
    header.className = 'search-header';
    header.innerHTML =
      '<svg class="search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>' +
      '</svg>';

    input = document.createElement('input');
    input.type = 'text';
    input.id = 'search-input';
    input.placeholder = 'Search posts, tags, sections…';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');

    var closeBtn = document.createElement('button');
    closeBtn.className = 'search-close-btn';
    closeBtn.setAttribute('aria-label', 'Close search');
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>' +
      '</svg>';
    closeBtn.addEventListener('click', closeSearch);

    header.appendChild(input);
    header.appendChild(closeBtn);

    var metaBar = document.createElement('div');
    metaBar.className = 'search-meta-bar';
    metaBar.innerHTML =
      '<span class="search-count" id="search-count"></span>' +
      '<span class="search-hint">' +
        '<kbd>↑↓</kbd> navigate &nbsp;' +
        '<kbd>↵</kbd> open &nbsp;' +
        '<kbd>Esc</kbd> close' +
      '</span>';

    resultsEl = document.createElement('div');
    resultsEl.id = 'search-results';
    resultsEl.setAttribute('role', 'listbox');

    var emptyEl = document.createElement('div');
    emptyEl.className = 'search-empty';
    emptyEl.id = 'search-empty';
    emptyEl.innerHTML =
      '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<circle cx="28" cy="28" r="18"/>' +
        '<path d="M40 40l12 12" stroke-linecap="round"/>' +
        '<path d="M22 28h12M28 22v12" stroke-linecap="round"/>' +
      '</svg>' +
      '<p>No results found</p>' +
      '<span>Try different keywords or check spelling</span>';

    modal.appendChild(header);
    modal.appendChild(metaBar);
    modal.appendChild(resultsEl);
    modal.appendChild(emptyEl);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeSearch();
    });

    input.addEventListener('input', function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() { runSearch(input.value.trim()); }, 80);
    });

    document.addEventListener('keydown', handleKeydown);
  }

  function bindTriggers() {
    var btn = document.getElementById('search-toggle') || document.querySelector('.search-btn');
    if (btn) btn.addEventListener('click', function() {
      isOpen ? closeSearch() : openSearch();
    });
  }

  function openSearch() {
    isOpen = true;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function() { input.focus(); }, 60);
    if (!currentQuery) showRecent();
  }

  function closeSearch() {
    isOpen = false;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    input.value   = '';
    currentQuery  = '';
    selectedIdx   = -1;
    resultsEl.innerHTML = '';
    setCount('');
    setEmpty(false);
  }

  function showRecent() {
    if (!_s_posts.length) return;
    var recent = _s_posts
      .slice()
      .sort(function(a, b) { return new Date(b.date) - new Date(a.date); })
      .slice(0, 6);
    renderResults(recent, '', 'Recent posts');
    setCount('');
  }

  async function runSearch(query) {
    currentQuery = query;
    selectedIdx  = -1;

    if (!query) { showRecent(); setEmpty(false); return; }

    if (!_s_loaded) {
      setCount('Searching…');
      await loadAllPages();
    }

    var terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    var scored = _s_posts.map(function(post) {
      var titleLow   = (post.title       || '').toLowerCase();
      var descLow    = (post.description || '').toLowerCase();
      var sectionLow = (post.section     || '').toLowerCase();
      var tagsLow    = (post.tags        || []).join(' ').toLowerCase();

      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var t = terms[i];
        var hit = titleLow.includes(t) || descLow.includes(t) ||
                  sectionLow.includes(t) || tagsLow.includes(t);
        if (!hit) return null;
        if (titleLow.includes(t))   score += 10;
        if (tagsLow.includes(t))    score += 6;
        if (sectionLow.includes(t)) score += 3;
        if (descLow.includes(t))    score += 1;
      }
      return { post: post, score: score };
    })
    .filter(Boolean)
    .sort(function(a, b) { return b.score - a.score; })
    .map(function(r) { return r.post; });

    if (!scored.length) {
      resultsEl.innerHTML = '';
      setCount('No results');
      setEmpty(true);
    } else {
      setEmpty(false);
      setCount(scored.length + (scored.length === 1 ? ' result' : ' results'));
      renderResults(scored, query);
    }
  }

  function renderResults(items, query, label) {
    resultsEl.innerHTML = '';

    if (label) {
      var lbl = document.createElement('div');
      lbl.className = 'search-results-label';
      lbl.textContent = label;
      resultsEl.appendChild(lbl);
    }

    items.forEach(function(post, i) {
      var item = document.createElement('a');
      item.className = 'search-result-item';
      item.href = post.permalink;
      item.setAttribute('role', 'option');
      item.dataset.idx = i;

      var section = post.section || 'post';
      var color   = (typeof SECTION_COLOR_MAP !== 'undefined' && SECTION_COLOR_MAP[section])
                    || '#525252';
      var desc    = post.description || '';
      var tags = post.tags || [];

      var tagsHTML = tags.map(function(tag) {
        var match = query && tag.toLowerCase().includes(query.toLowerCase());
        return '<span class="sr-tag' + (match ? ' sr-tag--match' : '') + '">' + esc(tag) + '</span>';
      }).join('');

      item.innerHTML =
        '<div class="sr-left">' +
          '<div class="sr-section" style="--sc:' + color + '">' + esc(section) + '</div>' +
          '<div class="sr-title">'   + hl(post.title || 'Untitled', query) + '</div>' +
          '<div class="sr-summary">' + hl(trunc(desc, 120), query) + '</div>' +
          (tagsHTML ? '<div class="sr-tags">' + tagsHTML + '</div>' : '') +
        '</div>' +
        '<div class="sr-right">' +
          '<svg class="sr-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
            '<polyline points="9 18 15 12 9 6"/>' +
          '</svg>' +
        '</div>';

      item.addEventListener('mouseenter', (function(idx) {
        return function() { selectedIdx = idx; updateSelected(); };
      })(i));

      resultsEl.appendChild(item);
    });
  }

  function handleKeydown(e) {
    if (!isOpen) {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
        var active = document.activeElement;
        var typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (!typing || e.key === 'k') { e.preventDefault(); openSearch(); }
      }
      return;
    }
    var items = resultsEl.querySelectorAll('.search-result-item');
    switch (e.key) {
      case 'Escape':
        e.preventDefault(); closeSearch(); break;
      case 'ArrowDown':
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
        updateSelected(); scrollIntoView(); break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        updateSelected(); scrollIntoView(); break;
      case 'Enter':
        e.preventDefault();
        var t = items[selectedIdx] || items[0];
        if (t) t.click(); break;
    }
  }

  function updateSelected() {
    resultsEl.querySelectorAll('.search-result-item').forEach(function(el, i) {
      el.classList.toggle('is-selected', i === selectedIdx);
    });
  }

  function scrollIntoView() {
    var items = resultsEl.querySelectorAll('.search-result-item');
    if (items[selectedIdx]) items[selectedIdx].scrollIntoView({ block: 'nearest' });
  }

  function setCount(text) {
    var el = document.getElementById('search-count');
    if (el) el.textContent = text;
  }

  function setEmpty(show) {
    var el = document.getElementById('search-empty');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  function hl(text, query) {
    if (!query || !text) return esc(text);
    var safe  = esc(text);
    var terms = query.trim().split(/\s+/).filter(Boolean);
    var out   = safe;
    terms.forEach(function(t) {
      var re = new RegExp('(' + escRe(esc(t)) + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  function trunc(str, max) {
    if (!str || str.length <= max) return str;
    return str.slice(0, max).replace(/\s+\S*$/, '') + '…';
  }

  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function escRe(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

})();