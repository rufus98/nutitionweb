// Service worker della web app paziente: tiene in cache solo l'app (HTML, JS, CSS, caratteri, icone),
// così si apre anche senza rete. I dati del paziente NON passano da qui: le risposte di /api/ non vengono mai
// salvate in cache (la copia offline del piano è gestita dall'app e si cancella se lo studio disattiva il link).
const CACHE = 'nutrea-app-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/icon.svg', '/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Pagine (/p/{token}, /): prima la rete, poi la copia dell'app.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  // File con hash nel nome (/assets/…) e icone: prima la cache, poi la rete (e si salvano).
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && (url.pathname.startsWith('/assets/') || /\.(png|svg|woff2?)$/.test(url.pathname))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
