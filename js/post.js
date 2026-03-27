/**
 * ZureFX — post.js
 * TOC dinámico con accordion hover · Scroll spy · Progress bar
 * Copy buttons · Table wrap · Scrollbar hover · Menu
 */

(function () {
  'use strict';

  let isScrollingTo  = false;
  let scrollEndTimer = null;

  document.addEventListener('DOMContentLoaded', () => {
    buildProgressBar();
    buildTOC();
    initScrollSpy();
    initCopyButtons();
    wrapTables();
    initScrollbarHover();
    initMenu();
  });

  /* ═══════════════════════════════════════════
     BARRA DE PROGRESO
     ═══════════════════════════════════════════ */
  function buildProgressBar() {
    const bar = document.createElement('div');
    bar.className = 'post-progress';
    document.body.prepend(bar);
    window.addEventListener('scroll', () => {
      const docH = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      bar.style.width = (docH > 0 ? (window.scrollY / docH) * 100 : 0).toFixed(1) + '%';
    }, { passive: true });
  }

  /* ═══════════════════════════════════════════
     TOC DINÁMICO — Accordion on hover
     ═══════════════════════════════════════════ */
  function buildTOC() {
    const content = document.querySelector('.post-content');
    const sidebar = document.querySelector('.col-sidebar');
    if (!content || !sidebar) return;

    const headings = Array.from(content.querySelectorAll('h2, h3'));
    if (!headings.length) return;

    headings.forEach(h => { if (!h.id) h.id = slugify(h.textContent); });

    const nav = document.createElement('nav');
    nav.className = 'toc-nav';

    let currentGroup   = null;
    let currentSublist = null;

    headings.forEach(h => {
      if (h.tagName === 'H2') {
        currentGroup = document.createElement('div');
        currentGroup.className = 'toc-group';

        const a = document.createElement('a');
        a.className   = 'toc-link toc-h2';
        a.href        = '#' + h.id;
        a.textContent = h.textContent.trim();
        a.addEventListener('click', e => { e.preventDefault(); navigateTo(h.id); });

        currentSublist = document.createElement('div');
        currentSublist.className = 'toc-sublist';

        currentGroup.appendChild(a);
        currentGroup.appendChild(currentSublist);
        nav.appendChild(currentGroup);

      } else if (h.tagName === 'H3' && currentSublist) {
        const a = document.createElement('a');
        a.className   = 'toc-link toc-h3';
        a.href        = '#' + h.id;
        a.textContent = h.textContent.trim();
        a.addEventListener('click', e => { e.preventDefault(); navigateTo(h.id); });
        currentSublist.appendChild(a);
      }
    });

    const section = document.createElement('div');
    section.className = 'sb-section';

    const heading = document.createElement('h4');
    heading.className   = 'sb-heading';
    heading.textContent = 'TABLE OF CONTENTS';

    section.appendChild(heading);
    section.appendChild(nav);
    sidebar.insertBefore(section, sidebar.firstChild);
  }

  function expandGroup(group) {
    const sub = group.querySelector('.toc-sublist');
    if (sub) sub.classList.add('is-open');
  }

  function collapseGroup(group) {
    const sub = group.querySelector('.toc-sublist');
    if (sub) sub.classList.remove('is-open');
  }

  /* ═══════════════════════════════════════════
     SCROLL SPY
     ═══════════════════════════════════════════ */
  function initScrollSpy() {
    const links = document.querySelectorAll('.toc-link');
    if (!links.length) return;

    const ids        = Array.from(links).map(l => l.getAttribute('href')?.replace('#', '')).filter(Boolean);
    const headingEls = ids.map(id => document.getElementById(id)).filter(Boolean);
    if (!headingEls.length) return;

    let ticking = false;
    let lastId  = null;

    function onScroll() {
      if (isScrollingTo || ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const offset = 100;
        let activeEl = null;
        for (let i = headingEls.length - 1; i >= 0; i--) {
          if (headingEls[i].getBoundingClientRect().top <= offset) {
            activeEl = headingEls[i]; break;
          }
        }
        if (!activeEl) activeEl = headingEls[0];
        const newId = activeEl?.id;
        if (newId && newId !== lastId) { lastId = newId; setActive(newId); }
        ticking = false;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function setActive(id) {
    document.querySelectorAll('.toc-link').forEach(l => l.classList.remove('is-active'));
    const activeLink = document.querySelector(`.toc-link[href="#${id}"]`);
    if (!activeLink) return;
    activeLink.classList.add('is-active');
    document.querySelectorAll('.toc-group').forEach(group => {
      group.contains(activeLink) ? expandGroup(group) : collapseGroup(group);
    });
  }

  /* ═══════════════════════════════════════════
     NAVIGATE
     ═══════════════════════════════════════════ */
  function navigateTo(id) {
    isScrollingTo = true;
    setActive(id);
    scrollToHeading(id);
    clearTimeout(scrollEndTimer);

    function onScrollEnd() {
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(() => {
        isScrollingTo = false;
        window.removeEventListener('scroll', onScrollEnd);
      }, 80);
    }
    window.addEventListener('scroll', onScrollEnd, { passive: true });
    scrollEndTimer = setTimeout(() => {
      isScrollingTo = false;
      window.removeEventListener('scroll', onScrollEnd);
    }, 150);
  }

  function scrollToHeading(id) {
    const target = document.getElementById(id);
    if (!target) return;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
  }

  function slugify(text) {
    return text.toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 64);
  }

  /* ═══════════════════════════════════════════
     COPY BUTTONS
     ═══════════════════════════════════════════ */
  function initCopyButtons() {
    document.querySelectorAll('.post-content pre').forEach(pre => {
      if (pre.closest('.code-block-wrapper')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.setAttribute('aria-label', 'Copy code');
      btn.innerHTML = copyIcon();
      wrapper.appendChild(btn);

      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const code = pre.querySelector('code')?.innerText || pre.innerText;
        try {
          await navigator.clipboard.writeText(code);
          btn.classList.add('copied');
          btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = copyIcon(); }, 1500);
        } catch (err) { console.error('Copy failed:', err); }
      });
    });
  }

  function copyIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`;
  }

  /* ═══════════════════════════════════════════
     WRAP TABLES — scroll horizontal si desbordan
     Envuelve cada <table> en un .table-wrap para
     que el overflow-x funcione sin romper el layout.
     ═══════════════════════════════════════════ */
  function wrapTables() {
    document.querySelectorAll('.post-content table').forEach(table => {
      if (table.closest('.table-wrap')) return;  /* ya envuelta */
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  /* ═══════════════════════════════════════════
     SCROLLBAR HOVER
     ═══════════════════════════════════════════ */
  function initScrollbarHover() {
    document.querySelectorAll('.post-content pre').forEach(pre => {
      pre.addEventListener('mouseenter', () => {
        pre.classList.add('pre-hovered');
        pre.style.scrollbarWidth = 'thin';
        pre.style.scrollbarColor = 'var(--border) transparent';
      });
      pre.addEventListener('mouseleave', () => {
        pre.classList.remove('pre-hovered');
        pre.style.scrollbarWidth = 'none';
        pre.style.scrollbarColor = '';
      });
    });
  }

  /* ═══════════════════════════════════════════
     MENU
     ═══════════════════════════════════════════ */
  function initMenu() {
    const sideMenu    = document.getElementById('sideMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    const hamBtn      = document.getElementById('hamburgerBtn');

    const open  = () => { sideMenu?.classList.add('open'); menuOverlay?.classList.add('open'); document.body.style.overflow = 'hidden'; };
    const close = () => { sideMenu?.classList.remove('open'); menuOverlay?.classList.remove('open'); document.body.style.overflow = ''; };

    hamBtn?.addEventListener('click', open);
    menuOverlay?.addEventListener('click', close);
  }

})();