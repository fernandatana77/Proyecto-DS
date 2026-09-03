/* Offline-first: precache del app shell; API siempre a la red. */
const CACHE = 'inv-tic-v6';
const SHELL = [
  '/',
  '/index.html',
  '/catalogo.html',
  '/staff.html',
  '/panel.html',
  '/css/estilos.css',
  '/js/api.js',
  '/js/login.js',
  '/js/staffLogin.js',
  '/js/panel.js',
  '/js/iconos.js',
  '/js/catalogo.js',
  '/js/pwa.js',
  '/manifest.json',
  '/iconos/icono.svg',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  // La API nunca se cachea: datos sensibles y cambiantes.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // App shell: cache-first con respaldo de red.
  evento.respondWith(
    caches.match(evento.request).then((enCache) => {
      if (enCache) return enCache;
      return fetch(evento.request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE).then((c) => c.put(evento.request, copia));
          return respuesta;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
