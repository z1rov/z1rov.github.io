// Author: z1rov

(function () {
  'use strict';

  var PREVIEW_LINES  = 15;
  var MIN_LINES      = 20;
  var LINE_HEIGHT_PX = 19.6;
  var PADDING_PX     = 14;

  var CHEVRON_DOWN =
    '<svg viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="6 9 12 15 18 9"/></svg>';

  var CHEVRON_UP =
    '<svg viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="18 15 12 9 6 15"/></svg>';

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(init, 0);
  });

  function init () {
    var wrappers = document.querySelectorAll('.post-content .code-block-wrapper');
    wrappers.forEach(function (wrapper) {
      var codeEl = wrapper.querySelector('code');
      if (!codeEl) return;

      var text  = codeEl.innerText || codeEl.textContent || '';
      var lines = text.split('\n').length;
      if (text.charAt(text.length - 1) === '\n') lines -= 1;
      if (lines < MIN_LINES) return;

      makeCollapsible(wrapper);
    });
  }

  function makeCollapsible (wrapper) {
    var previewH = PADDING_PX + PREVIEW_LINES * LINE_HEIGHT_PX;

    var block = document.createElement('div');
    block.className = 'collapsible-block';
    block.style.setProperty('--preview-h', previewH + 'px');

    var preview = document.createElement('div');
    preview.className = 'cb-preview';

    var fade = document.createElement('div');
    fade.className = 'cb-fade';

    var parent = wrapper.parentNode;
    parent.insertBefore(block, wrapper);
    preview.appendChild(wrapper);
    preview.appendChild(fade);
    block.appendChild(preview);

    var bar = document.createElement('div');
    bar.className = 'cb-bar';

    var showBtn = document.createElement('button');
    showBtn.type = 'button';
    showBtn.className = 'cb-show-btn';
    showBtn.setAttribute('aria-expanded', 'false');
    showBtn.innerHTML =
      '<span>Show all</span>' +
      '<span class="cb-show-icon">' + CHEVRON_DOWN + '</span>';

    bar.appendChild(showBtn);
    block.appendChild(bar);

    var foldBar = document.createElement('div');
    foldBar.className = 'cb-fold-bar';

    var foldBtn = document.createElement('button');
    foldBtn.type = 'button';
    foldBtn.className = 'cb-fold-btn';
    foldBtn.setAttribute('aria-expanded', 'true');
    foldBtn.innerHTML =
      '<span class="cb-fold-icon">' + CHEVRON_UP + '</span>' +
      '<span>Fold</span>';

    foldBar.appendChild(foldBtn);
    block.appendChild(foldBar);

    showBtn.addEventListener('click', function () { expand(block, bar, preview); });
    foldBtn.addEventListener('click', function () { collapse(block, bar); });
  }

  function expand (block, bar, preview) {
    var realH = preview.scrollHeight;
    block.style.setProperty('--full-h', realH + 'px');
    block.classList.add('is-open');
    bar.style.display = 'none';
  }

  function collapse (block, bar) {
    block.classList.remove('is-open');
    bar.style.display = '';

    var rect = block.getBoundingClientRect();
    if (rect.top < 80) {
      window.scrollTo({
        top: window.scrollY + rect.top - 90,
        behavior: 'smooth'
      });
    }
  }

})();