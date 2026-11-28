/**
 * Casual-copy guard (3.0.1): blocks the right-click menu, the developer-tools and view-source
 * shortcuts, saving the page and dragging images.
 * This only stops casual users. The browser always downloads the page's code, and anyone can
 * still open the developer tools from the browser menu. The real protection is on the server:
 * every action checks the login and the permission ticks, and the Google Sheets are never
 * reachable from the browser.
 * Right-click and long-press still work inside text boxes (for copy and paste).
 */
(function () {
  'use strict';
  // Not inside another site's frame (stops click-jacking; GitHub Pages cannot send that header).
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location = window.self.location.href; } catch (e) { /* blocked: stay hidden */ }
    return;
  }
  // Excel library: if the CDN cannot be reached, use the copy in js/vendor/ (if it was uploaded).
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.id === 'xlsx-cdn' && !window.XLSX) {
      var s = document.createElement('script');
      s.src = 'js/vendor/xlsx.full.min.js';
      document.head.appendChild(s);
    }
  }, true);
  function editable(el) {
    return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }
  document.addEventListener('contextmenu', function (e) {
    if (!editable(e.target)) e.preventDefault();
  });
  document.addEventListener('dragstart', function (e) {
    if (e.target && e.target.tagName === 'IMG') e.preventDefault();
  });
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    var ctrl = e.ctrlKey || e.metaKey;
    var block =
      k === 'f12' ||
      (ctrl && e.shiftKey && ['i', 'j', 'c', 'k'].indexOf(k) >= 0) ||   // developer tools / console / inspect
      (e.metaKey && e.altKey && ['i', 'j', 'c', 'u'].indexOf(k) >= 0) || // the same on Mac
      (ctrl && !e.shiftKey && (k === 'u' || k === 's'));                 // view source, save page
    if (block) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  try {
    console.log('%cStop', 'color:#d92d20;font-size:28px;font-weight:bold');
    console.log('%cThis browser feature is for developers. Do not paste anything here: it could give someone else access to MAHS ICC and patient data.', 'font-size:14px');
  } catch (e) { /* no console */ }
})();
