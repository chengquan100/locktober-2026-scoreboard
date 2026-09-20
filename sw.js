/* Service Worker：只做一件事——缓存最后一次成功的数据，让地铁里也能看到最后一次成绩。
   策略：
     - 导航请求（HTML）  Network First —— 发新版立即生效，离线回落缓存
     - 壳层资源（JS/CSS） Stale-While-Revalidate —— 先给缓存再后台更新
     - data.json        Network First —— 拿不到就回落最后一次成功的数据
   发布新版本时把 VERSION 加一即可清掉旧缓存。 */

const VERSION = 'locktober-sb-v2';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/styles.css',
  './assets/app.js',
  './assets/config.js',
  './assets/i18n.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isShellAsset = (path) => /\.(js|css|webmanifest)$/.test(path);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/data/data.json')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? Response.error())),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((cache) => cache.put(new Request('./index.html', { method: 'GET' }), copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match('./index.html'))),
    );
    return;
  }

  if (isShellAsset(url.pathname) || url.pathname === '/') {
    event.respondWith(
      caches.match(request).then((hit) => {
        const refresh = fetch(request)
          .then((res) => {
            if (res.ok) caches.open(SHELL).then((cache) => cache.put(request, res.clone()));
            return res;
          })
          .catch(() => hit);
        return hit ?? refresh;
      }),
    );
  }
});

