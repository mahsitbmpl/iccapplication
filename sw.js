/**
 * Service worker: the app shell is cached on the device so the app opens instantly
 * (also on slow mobile data). API calls are never cached: patient data always comes
 * live from the server (and the cached patient list lives in localStorage, cleared at logout).
 * Bump CACHE when deploying a new version so devices pick up the new files.
 */
var CACHE = 'mahs-icc-v1.2.0';
var SHELL = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/his-parse.js', 'js/core.js', 'js/views-main.js',
  'js/views-settings.js', 'js/views-admin.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'img/logo.png', 'img/mark.png'];
var XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(SHELL).then(function () { return c.add(XLSX_URL).catch(function () {}); });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // API calls are POST: straight to network
  var url = new URL(req.url);
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return;
  // Shell and the pinned Excel library: cache first, refresh in the background.
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res && res.ok && (url.origin === location.origin || req.url === XLSX_URL)) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
