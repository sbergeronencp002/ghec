// Service Worker — GHEC · CSSBF
// Stratégie : cache-first pour les assets versionnés (?v=N — une nouvelle version = une
// nouvelle URL = cache-miss naturel), réseau-first avec repli cache pour index.html,
// contexte.js, questions.js et questions-index.js (fichiers non versionnés ou régénérés
// à chaque publication : mieux vaut une donnée fraîche que du cache indéfiniment périmé),
// cache-first pour les images (fetch au premier accès, cache ensuite).
//
// ⚠️ CACHE doit être incrémenté à chaque changement de PRECACHE (cf. CLAUDE.md, table
// « Cache-bust actuel ») — sinon les navigateurs déjà visités gardent l'ancienne liste
// indéfiniment (self.skipWaiting()/clients.claim() ne rechargent pas les onglets ouverts).
const CACHE = 'hqc-v7';
const PRECACHE = [
  './style.css?v=31',
  './app.js?v=52',
  './filters.js?v=1',
  './oi-config.js?v=1',
];
// Précachés (comme repli hors-ligne) mais TOUJOURS revalidés réseau-first dans le
// handler 'fetch' ci-dessous : leur contenu change sans que leur URL change, un
// cache-first pur les figerait indéfiniment.
const NETWORK_FIRST_PRECACHE = [
  './index.html',
  './contexte.js',
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

  // Images — stale-while-revalidate. `includes()` (pas `startsWith()`) car le site est
  // servi sous un sous-chemin (GitHub Pages project site, ex. /ghec/images/…), pas à
  // la racine du domaine — startsWith('/images/') ne correspondait donc jamais.
  // Un remplacement d'image (documents.html/admin.html, même nom de fichier, contenu
  // modifié) garde la même URL : un cache-first pur ne revaliderait jamais et servirait
  // l'ancienne version indéfiniment. On sert le cache immédiatement s'il existe (rapide,
  // fonctionne hors-ligne) mais on relance systématiquement une requête réseau en arrière-
  // plan pour rafraîchir le cache — l'image à jour apparaît donc au 2ᵉ chargement au plus
  // tard, au lieu de rester figée tant que le cache SW n'est pas vidé manuellement.
  if (url.pathname.includes('/images/')) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const network = fetch(e.request).then(r => {
            if (r.ok) cache.put(e.request, r.clone());
            return r;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Tous les autres assets — cache en premier, réseau en secours
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});
