/* Big TeleSales — Service Worker (Cache First) */
/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'bigtelesales-v2';

// В этом окружении приложение — один index.html + внешние CDN.
// Кэшируем критичные ресурсы. Для внешних доменов кэширование может зависеть от CORS,
// поэтому добавление выполняется best-effort (ошибки не валят установку).
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './notifications.js',
  './backup.js',

  // CDN assets (best-effort)
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(STATIC_ASSETS.map(async (url) => {
      try { await cache.add(url); } catch (e) { /* best-effort */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isHTML = req.mode === 'navigate' || req.destination === 'document' || (req.headers.get('accept') || '').includes('text/html');

  // Для HTML (index.html) используем Network-First, чтобы в обычном режиме не «залипать» на старой версии из кэша.
  // Это частая причина ситуаций «в инкогнито работает, в обычном — нет».
  if (isHTML){
    event.respondWith((async ()=>{
      try {
        const res = await fetch(req);
        if (res && res.ok){
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, res.clone()).catch(()=>{});
        }
        return res;
      } catch(e){
        return (await caches.match(req)) || (await caches.match('./index.html')) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Для остальных ресурсов — Cache-First
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (e) {
      return new Response('', { status: 503 });
    }
  })());
});
