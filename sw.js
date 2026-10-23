/* コマ帖 — オフラインでも開けるようにする */
var CACHE = 'komacho-v1.0.0';
var FILES = ['./', 'index.html', 'styles.css', 'config.js', 'js/model.js', 'js/store.js', 'js/exporter.js', 'js/drive.js', 'js/app.js',
  'help.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// 自分のファイルは「ネットを先に、だめならキャッシュ」。Googleとの通信には触れない
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // ブラウザが覚えている古いファイルを使わず、毎回GitHubに新しいものがないか確かめる
  var req = e.request.mode === 'navigate' ? e.request : new Request(e.request.url, { cache: 'no-cache' });
  e.respondWith(fetch(req).then(function (r) {
    var copy = r.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || caches.match('index.html'); });
  }));
});
