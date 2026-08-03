// Author: z1rov

(function () {

  var grid      = document.getElementById('notes-grid');
  var filtersEl = document.getElementById('notes-filters');
  var searchEl  = document.getElementById('notes-search');
  var emptyEl   = document.getElementById('notes-empty');
  var totalEl   = document.getElementById('notesTotal');
  if (!grid) return;

  function escN(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  var allNotes  = [];
  var activeSub = 'all';
  var searchQ   = '';

  function loadNotes() {
    if (typeof CACHE !== 'undefined' && Array.isArray(CACHE['notes']) && CACHE['notes'].length) {
      console.log('using cached notes (' + CACHE['notes'].length + ')');
      return Promise.resolve(CACHE['notes']);
    }

    if (typeof loadSection === 'function') {
      return loadSection('notes');
    }

    var url = getRootPrefix() + 'data/notes.json?v=' + Date.now();
    return fetch(url, { cache: 'no-store' })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        return Array.isArray(data) ? data : [];
      })
      .catch(function(err) {
        console.warn('Could not load notes.json:', err);
        return [];
      });
  }

  function buildCard(note, featured) {
    var a = document.createElement('a');
    a.className = featured ? 'note-card note-featured' : 'note-card';
    a.href      = note.permalink || '#';

    var sub  = (note.subsection || '').trim();
    var tags = (note.tags || []).slice(0, 5);

    var tagsHTML = tags.map(function(t) {
      return '<span class="note-card-tag">#' + escN(t) + '</span>';
    }).join('');

    a.innerHTML =
      '<div class="note-card-body">' +
        (sub ? '<span class="note-card-sub">' + escN(sub) + '</span>' : '') +
        '<h2 class="note-card-title">' + escN(note.title) + '</h2>' +
        '<p class="note-card-desc">' + escN(note.description || '') + '</p>' +
        (tagsHTML ? '<div class="note-card-tags">' + tagsHTML + '</div>' : '') +
        '<div class="note-card-foot">' +
          '<span class="note-card-date">' + fmtDate(note.date) + '</span>' +
          '<span class="note-card-arrow" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M9 18l6-6-6-6"/>' +
            '</svg>' +
          '</span>' +
        '</div>' +
      '</div>';

    return a;
  }

  function render() {
    var q = searchQ.toLowerCase();
    var filtered = allNotes.filter(function(note) {
      var noteSub  = (note.subsection || '').trim();
      var matchSub = activeSub === 'all' || noteSub === activeSub;
      var matchQ   = !q ||
        note.title.toLowerCase().includes(q) ||
        (note.description || '').toLowerCase().includes(q) ||
        (note.tags || []).some(function(t) { return t.toLowerCase().includes(q); });
      return matchSub && matchQ;
    });

    grid.innerHTML = '';
    if (!filtered.length) {
      emptyEl && emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl && emptyEl.classList.add('hidden');

    var frag = document.createDocumentFragment();
    filtered.forEach(function(note, i) {
      frag.appendChild(buildCard(note, i === 0));
    });
    grid.appendChild(frag);
  }

  grid.innerHTML =
    '<div style="padding:40px 0;text-align:center;font-family:var(--mono);' +
    'font-size:0.58rem;letter-spacing:0.1em;color:var(--text-3)">LOADING…</div>';

  loadNotes().then(function(posts) {

    allNotes = posts.sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });

    if (totalEl) {
      var span = totalEl.querySelector('span');
      if (span) span.textContent = allNotes.length + ' note' + (allNotes.length !== 1 ? 's' : '');
    }

    var subCount = new Map();
    allNotes.forEach(function(n) {
      var sub = (n.subsection || '').trim();
      if (sub) subCount.set(sub, (subCount.get(sub) || 0) + 1);
    });

    var frag = document.createDocumentFragment();
    Array.from(subCount.entries())
      .sort(function(a, b) { return a[0].localeCompare(b[0]); })
      .forEach(function(entry) {
        var btn = document.createElement('button');
        btn.className   = 'notes-filter-btn';
        btn.dataset.sub = entry[0];
        btn.innerHTML   = escN(entry[0]) + ' <span class="fc">' + entry[1] + '</span>';
        frag.appendChild(btn);
      });
    filtersEl.appendChild(frag);

    render();

    filtersEl.addEventListener('click', function(e) {
      var btn = e.target.closest('.notes-filter-btn');
      if (!btn) return;
      document.querySelectorAll('.notes-filter-btn').forEach(function(b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      activeSub = btn.dataset.sub || 'all';
      render();
    });

    if (searchEl) {
      var _st;
      searchEl.addEventListener('input', function(e) {
        clearTimeout(_st);
        _st = setTimeout(function() {
          searchQ = e.target.value.trim();
          render();
        }, 100);
      });
    }

  }).catch(function(err) {
    console.error(err);
    grid.innerHTML = '<div class="notes-empty">Could not load notes.</div>';
  });

})();