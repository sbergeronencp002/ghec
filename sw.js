// Service Worker — GHEC · CSSBF
// Stratégie : cache-first pour les assets versionnés (?v=N), réseau-first avec repli
// cache pour les pages et les images, afin de détecter les remplacements conservant
// le même nom de fichier dès leur publication par GitHub Pages.
//
// ⚠️ CACHE doit être incrémenté à chaque changement de PRECACHE (cf. CLAUDE.md, table
// « Cache-bust actuel ») — sinon les navigateurs déjà visités gardent l'ancienne liste
// indéfiniment (self.skipWaiting()/clients.claim() ne rechargent pas les onglets ouverts).
const CACHE = 'ghec-v36';
const PRECACHE = [
  './sync-data.js?v=2',
  './admin-tools.js?v=1',
  './revision-tools.js?v=1',
  './documents-tools.js?v=2',
  './main-ui.js?v=1',
  './style.css?v=41',
  './app.js?v=74',
  './filters.js?v=6',
];
// Précachés (comme repli hors-ligne) mais TOUJOURS revalidés réseau-first dans le
// handler 'fetch' ci-dessous : leur contenu change sans que leur URL change, un
// cache-first pur les figerait indéfiniment. oi-config.js est publié par la même
// section Configuration d'admin.html, sans bump de version — même risque de
// péremption que contexte.js/competences.js (corrigé 2026-08-18, il était resté
// en cache-first pur depuis la mise en place de la section Configuration).
const NETWORK_FIRST_PRECACHE = [
  './index.html',
  './contexte.js',
  './competences.js',
  './oi-config.js?v=1',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll([...PRECACHE, ...NETWORK_FIRST_PRECACHE]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Requêtes externes (API GitHub, fonts…) — bypass SW
  if (url.origin !== self.location.origin) return;

  // questions.js, questions-index.js, index.html, contexte.js — réseau en premier
  // (contenu qui change sans que l'URL change : données régénérées à chaque publication,
  // ou page/config modifiée sans bump de version), repli sur le cache si hors ligne.
  // admin.html/documents.html/revision.html sont ici pour la même raison : ce sont des
  // pages d'édition dont le JS change au fil des correctifs — un onglet ou un cache SW
  // figé sur une ancienne version peut alors réintroduire un bug déjà corrigé (vécu :
  // une page restée en cache-first pouvait servir un revision.html obsolète qui, lui,
  // ne connaissait pas encore le correctif de lecture via l'API GitHub).
  const isNetworkFirst = url.pathname.endsWith('/questions.js')
    || url.pathname.endsWith('/questions-index.js')
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/') // navigation vers la racine du site (ex. /ghec/) == index.html
    || url.pathname.endsWith('/contexte.js')
    || url.pathname.endsWith('/competences.js')
    || url.pathname.endsWith('/oi-config.js')
    || url.pathname.endsWith('/admin.html')
    || url.pathname.endsWith('/documents.html')
    || url.pathname.endsWith('/revision.html')
    || url.pathname.endsWith('/examen.html');
  if (isNetworkFirst) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() => caches.match(e.request).then(c => c || new Response('', { status: 503 })))
    );
    return;
  }

  // Images — réseau en premier, cache seulement en repli hors ligne.
  // Avec l'ancienne stratégie stale-while-revalidate, une image remplacée avec le
  // même nom restait ancienne au premier affichage dans Main, Admin et Révision.
  // Dès que GitHub Pages publie le remplacement, la prochaine requête récupère
  // l'image récente plutôt que de renvoyer systématiquement une copie périmée.
  if (url.pathname.includes('/images/')) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        fetch(e.request).then(r => {
          if (r.ok) cache.put(e.request, r.clone());
          return r;
        }).catch(() => cache.match(e.request).then(cached => cached || new Response('', { status: 503 })))
      )
    );
    return;
  }

  // Tous les autres assets — cache en premier, réseau en secours
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});
