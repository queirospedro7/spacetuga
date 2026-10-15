const CACHE = 'tuga-original-icon-swing-v4';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/','/manifest.webmanifest','/tuga-icon.png'])));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('tuga-shell-') && key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || event.request.headers.has('authorization') || url.pathname.startsWith('/api/') || url.searchParams.has('token')) return;
  const shell = event.request.mode === 'navigate' || url.pathname.startsWith('/assets/') || ['/manifest.webmanifest', '/tuga-icon.png'].includes(url.pathname);
  if (!shell) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? await caches.match('/') : null) || Response.error()));
});





