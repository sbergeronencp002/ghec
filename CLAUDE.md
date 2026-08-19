# Instructions projet — GHEC · CSSBF

## Origine

Ce dépôt est un fork structurel du dépôt `hqccssbf` (banque de questions Histoire du
Québec et du Canada) pour le programme **GHEC** (Géographie, histoire et éducation à
la citoyenneté). Toute l'architecture technique est identique et générique — filtres,
panier, DOCX, admin, révision, générateur d'examens — **rien n'est codé en dur pour un
programme précis** dans ces pages. Les trois fichiers réellement spécifiques au contenu
pédagogique (`oi-config.js`, `competences.js`, `contexte.js`) sont gérés via la section
« ⚙️ Configuration du programme » d'`admin.html`, sans toucher au code.

**Terminologie** : le champ que HQC appelait « période » s'appelle **« Société »** dans
toute la présentation GHEC (labels, filtres, messages). `PERIODES_PAR_NIVEAU`/
`ASPECTS_PAR_PERIODE` gardent leur nom de code (aucun renommage) — seule la présentation
change. Ne jamais réintroduire le mot « Période » dans un label utilisateur sans
consulter l'enseignant d'abord.

**Une question peut avoir 1 ou 2 sociétés** (`q.periodes`, **tableau**, jamais une
chaîne seule — contrairement à hqccssbf où `periode` était singulier). 1 société pour
une question « simple » (ex. compétence « Lire l'organisation du territoire ») ; 2 pour
une question de comparaison (ex. « Interpréter le changement » : même société à deux
époques ; « S'ouvrir à la diversité » : deux sociétés différentes à la même époque).
Le filtre Société d'index.html/revision.html reste un `<select>` à choix unique, mais
depuis le 2026-08-18 sa liste d'options combine deux catégories DISJOINTES (voir
`filters.js` — `computePeriodeCombos`/`fillPeriodeSelect`/`matchesPeriodeFilter`, partagé
par les deux pages) : les sociétés simples — sélectionner une société simple affiche
UNIQUEMENT les questions à une seule société, celle-ci (`q.periodes` égal exactement
`[société]`) — PLUS un groupe « Comparaisons » listant chaque paire de sociétés qui
apparaît réellement ensemble dans au moins une question (jamais une paire théorique sans
question) — sélectionner une combinaison affiche UNIQUEMENT les questions de comparaison
entre CES deux sociétés précises (`q.periodes` égal exactement à la paire). Une question
de comparaison n'apparaît donc plus sous ses sociétés individuelles dans ce filtre (ancien
comportement `.includes()`, corrigé le 2026-08-18 — une société simple montrait aussi les
comparaisons qui l'impliquaient, redondant avec la nouvelle combinaison dédiée) : elle
n'est accessible que via sa combinaison. Le filtre Aspect, lui, continue d'utiliser
`.includes()` sur `q.aspects` sans cette restriction — pas concerné par ce changement.
`examen.html` n'a pas cette liste combinée : son sélecteur Société sert à choisir LA
société pour laquelle générer un examen, un usage différent d'un filtre de navigation —
resté un simple choix unique de société parmi `PERIODES_PAR_NIVEAU`. Ne jamais
réintroduire un champ `periode` singulier
— toute la chaîne (admin.html, app.js, revision.html, documents.html, examen.html/
examen-gen.js, worker/index.js, tools/apply-mutation.mjs, tools/validate-questions.mjs,
questions-io.js) a été adaptée pour lire/écrire `periodes` (tableau).

**Trois dimensions de classement indépendantes par question** : **OI** (opération
intellectuelle — 8 choix, détermine réglette/couleur/réponse par défaut, voir
`oi-config.js`), **Compétence** (3 choix, simple étiquette de filtrage sans réglette ni
couleur, voir `competences.js`), et **Société(s)** (1 ou 2, voir ci-dessus) — trois
champs séparés dans le formulaire (`q-oi`, `q-competence`, cases à cocher
`.q-periode-cb`), filtrés indépendamment sur le site public et dans revision.html, dans
l'ordre Niveau → Compétence → Société → Aspect → OI. Ne jamais fusionner ces dimensions
ni supposer qu'elles se correspondent un-à-un.

## Règles de workflow — autorisation permanente

- **Merger** vers `main` sans demander confirmation, dès que des changements sont prêts.
- **Réparer** tout problème fonctionnel sans attendre confirmation.

---

## Règle absolue — ne jamais toucher questions.js via git

`questions.js` (et `questions-index.js`) sont gérés **exclusivement** par `admin.html`
(et `documents.html`) qui publient directement sur `main` via l'API GitHub Contents. Ne
jamais modifier ces fichiers via un commit git — les publications admin lisent l'état
courant avant d'écrire ; un commit git parallèle contourne cette logique (pas de
sauvegarde automatique, pas de régénération de l'index, pas de détection de conflit) et
peut être silencieusement écrasé par la publication suivante, ou l'inverse.

Mes commits git ne doivent contenir que des fichiers de code : `app.js`, `style.css`,
`admin.html`, `index.html`, `documents.html`, `revision.html`, `examen.html`,
`examen-gen.js`, `docx-examen.js`, `oi-config.js`, `competences.js`, `reglettes.js`,
`contexte.js`, `CLAUDE.md`, etc. — jamais `questions.js` ni `questions-index.js`.

**Même règle pour `oi-config.js`, `competences.js` et `contexte.js`** une fois que la
section Configuration d'admin.html a commencé à les gérer (elle écrit directement sur
GitHub, comme pour les questions) : à partir de ce moment-là, les éditer à la main dans
un commit git risquerait le même genre d'écrasement silencieux.

---

## État actuel : GHEC 3 en saisie active

`oi-config.js` (8 OI), `competences.js` (3 compétences), `contexte.js` (niveau 3 : 4
sociétés — Les Iroquoiens vers 1500, Les Algonquiens vers 1500, Les Incas vers 1500, Les
Iroquoiens vers 1745 — 10 aspects communs à toutes) sont configurés. `questions.js` est en
saisie active par l'enseignant depuis admin.html (plus de 100 questions au 2026-08-17,
en croissance continue) — vérifier `tools/validate-questions.mjs` pour le compte à jour
plutôt que de se fier à ce nombre. Les niveaux 4/5/6 restent à ajouter (mêmes
compétences/OI, nouvelles sociétés propres à chaque niveau) via la section Configuration.

⚠️ Le 17 août 2026, une remise à zéro complète a eu lieu (doublons + questions hors PDA) :
`questions.js`/`questions-index.js` vidés, toutes les images et tous les backups
supprimés — voir l'historique de conversation si le contexte de cet événement est utile.
La numérotation Q# n'a jamais été réutilisée depuis (voir section suivante).

### Numérotation des questions (Q#)

Les identifiants sont **permanents**, pas positionnels : supprimer Qn ne renumérote
jamais les autres questions, et le prochain id publié est toujours `max(ids existants) +
1` (jamais un id réutilisé, même après suppression — un trou dans la séquence est normal
et volontaire, ça évite qu'un id déjà cité ailleurs — réglette, examen généré, notes de
correction — se retrouve réattribué à une autre question).

---

## Architecture

Site statique GitHub Pages — aucun backend. Tout tourne dans le navigateur.

### Fichiers clés

| Fichier | Rôle |
|---------|------|
| `index.html` | Site public (filtres, cartes, panier, prévisualisation, génération DOCX) |
| `admin.html` | Interface de saisie/modification des questions **+ section Configuration** (OI, compétences, niveaux/sociétés/aspects) — pousse via GitHub Contents API |
| `documents.html` | Gestion Documents & Images — galerie de toutes les images, vue par question, images non utilisées. Renomme/remplace/supprime des images et édite les sous-titres directement via l'API GitHub (token partagé avec admin.html) |
| `revision.html` | Révision par cartes — parcourt les questions une à la fois, navigation clavier/tactile, tout affiché sur une carte (énoncé, documents, réglette, réponse, guide). Édition inline du guide/énoncé/documents texte via l'API GitHub |
| `examen.html` | Générateur d'examens — sélection automatique par aspect/OI/budget de points, remplacement manuel, génération de 3 DOCX (questionnaire, dossier documentaire, guide). Lecture seule sur `questions.js`. Les tables de réglages fines (cibles par OI, scénarios par période — voir `examen-gen.js`) sont **vides par défaut** : le générateur utilise l'algorithme générique (variété + budget) tant qu'aucun réglage n'est ajouté |
| `examen-gen.js` | Algorithme pur de sélection (exact-cover des aspects + budget de points + quota OI) et de renumérotation des documents. Aucune dépendance au DOM — testable via node |
| `docx-examen.js` | Génération des 3 DOCX d'examen.html |
| `app.js` | Toute la logique du site public (rendu, filtres, panier, DOCX) |
| `questions.js` | Données : `REGLETTES`, `IMAGE_DB`, `QUESTIONS` — généré et écrit par admin, **vide au départ** (aucune question saisie) |
| `reglettes.js` | Préréglages de réglettes par OI (`REGLETTES_PRESET`), **vide au départ** — gérable à la main dans admin.html en attendant une éventuelle UI dédiée |
| `contexte.js` | `PERIODES_PAR_NIVEAU` (niveau → sociétés), `ASPECTS_PAR_PERIODE` (société → aspects) — géré via la section Configuration d'admin.html. Niveau 3 configuré ; 4/5/6 à venir |
| `oi-config.js` | Source unique des OI : `OI_CONFIG` (couleur, sous-tags, auto-réponse) + `OI_LIST` (ordre du menu, 8 OI) — géré via la section Configuration d'admin.html |
| `competences.js` | `COMPETENCE_LIST` — dimension de classement **indépendante de l'OI** (3 compétences), simple liste sans couleur/réglette associée. Géré via la section Configuration d'admin.html |
| `questions-io.js` | Sérialiseur partagé : `serializeValue`, `ensureImageDbComplete`, `generateQuestionsJs`, `generateIndexJs`. Chargé par admin.html ET documents.html |
| `questions-index.js` | Index allégé (champs grille seulement) chargé par index.html au démarrage. Régénéré automatiquement par admin.html à chaque publication |
| `filters.js` | Cascade de filtres partagée niveau→période→aspect — générique, aucun niveau codé en dur (lit `PERIODES_PAR_NIVEAU`/`ASPECTS_PAR_PERIODE` dynamiquement) |
| `tools/validate-questions.mjs` | Validateur de données : vérifie `questions.js` contre `oi-config.js`, `competences.js`, `contexte.js` et les fichiers `images/`. Lancé en hook SessionStart |
| `tools/smoke-test.mjs` | Tests de fumée (fonctions de rendu critiques d'app.js, entrées adverses) |
| `tools/check-escaping.mjs` | Scanner anti-XSS (concaténations HTML non échappées) |
| `tools/check-all.mjs` | Lance les 3 vérifications ci-dessus — c'est celle-ci qui tourne en hook SessionStart |
| `worker/index.js` | Worker Cloudflare (`/publish` questions, `/upload-image` images) — voie de publication rapide et de contournement réseau depuis admin.html, déployé et actif. Contient sa propre copie du sérialiseur (**doit rester identique** à `questions-io.js`) |
| `tools/apply-mutation.mjs` | Fallback GitHub Actions (`repository_dispatch`) quand le Worker est inaccessible — même sérialiseur, même protection `editingId !== question.id` |
| `sw.js` | Service worker : réseau-first pour les données/pages d'édition, stale-while-revalidate pour les images |
| `style.css` | Styles du site public. 8 couleurs prédéfinies `--c-slot1` à `--c-slot8` (+ `-bg`) — la section Configuration d'admin.html en assigne une par OI |
| `backups/` | Backups auto avant chaque publication (admin) |

---

### Cache-bust actuel

`index.html` charge `app.js?v=57`, `style.css?v=33`, `filters.js?v=2`, `oi-config.js?v=1`.
`examen.html` charge `examen-gen.js?v=3`.
`sw.js` : `CACHE = 'ghec-v7'` (bump 2026-08-12 : ajout de `competences.js` à
`NETWORK_FIRST_PRECACHE`, absent depuis la mise en place de la section Configuration —
il restait donc en cache-first indéfiniment après une publication Configuration ; puis
bump suivant pour la justification des énoncés dans le cahier DOCX, voir plus bas ; puis
bump 2026-08-14 pour le remplacement du brun (`--c-slot8`) par un prune/bourgogne dans
`style.css` ; puis bump 2026-08-18 (revue de code complète) : `oi-config.js` déplacé de
`PRECACHE` vers `NETWORK_FIRST_PRECACHE` (même trou de fraîcheur que `competences.js`
avait en 2026-08-12, jamais corrigé pour `oi-config.js`) ; `app.js` (échappements
manquants, `titreWeb` incohérent, tri numérique des niveaux, nettoyage de code mort) et
`style.css` (focus clavier visible sur les filtres, `prefers-reduced-motion`) modifiés ;
`examen-gen.js` bumpé séparément (`?v=3`, pas dans le service worker) pour le correctif
du piège `EX_OI_FIXED_TARGET`/`exFixedTargetLevels` et le message d'erreur d'aspect sans
candidat ; puis bump suivant (`app.js?v=57`, `filters.js?v=2`, `CACHE='ghec-v7'`) pour le
filtre Société à combinaisons de comparaison (voir section suivante).

⚠️ **Incrémenter le `?v=N` d'`app.js` à chaque modification de son contenu** — sinon un
visiteur dont le service worker (`sw.js`) a déjà précaché l'ancienne URL continue de
recevoir indéfiniment l'ancien code, même après une publication (le SW ne revérifie
jamais un asset précaché en cache-first tant que son URL ne change pas). Incident vécu
le 2026-07-28 : plusieurs modifications d'`app.js` en cours de session sans bump de
version — répercuter aussi le nouveau `?v=N` dans `sw.js` (`PRECACHE`) et incrémenter la
constante `CACHE` de `sw.js` (une liste `PRECACHE` changée sans bump de `CACHE` laisse les
navigateurs déjà visités sur l'ancienne liste indéfiniment). Cette table doit être tenue à
jour à chaque bump, sinon un futur agent repart d'un mauvais numéro de version.

---

## Section Configuration d'admin.html (nouveau — n'existe pas dans hqccssbf)

Accessible via le lien d'ancrage « Configuration » en haut d'admin.html. Trois
sous-sections, chacune avec son propre bouton « Enregistrer » qui publie directement
sur GitHub (comme pour une question) :

- **Opérations intellectuelles (OI)** : liste de lignes (nom, couleur parmi les 8
  préréglages de style.css, sous-tags optionnels séparés par virgules, réponse
  auto-sélectionnée optionnelle). Réordonnables (↑↓), publiées vers `oi-config.js`.
- **Compétences** : simple liste ordonnée de noms (pas de couleur ni de réglette —
  ces attributs restent portés par l'OI). Publiées vers `competences.js`.
- **Niveaux et sociétés** : liste de niveaux, chacun contenant une liste de sociétés,
  chacune avec un textarea d'aspects (un par ligne, optionnel). Réordonnables,
  publiées vers `contexte.js`.

Fonctions clés (toutes dans admin.html, préfixe `cfg`) :
`cfgAddOi`/`cfgCollectOi`/`cfgPublishOi`/`cfgRenderOiList` (OI) ;
`cfgAddCompetence`/`cfgCollectCompetences`/`cfgPublishCompetences`/`cfgRenderCompetenceList`
(compétences) ;
`cfgAddNiveau`/`cfgAddPeriode`/`cfgCollectContexte`/`cfgPublishContexte`/`cfgRenderNiveauxList`
(niveaux/sociétés — `cfgAddPeriode`/`cfgCollectContexte` gardent leur nom de fonction
historique bien que le vocabulaire affiché soit « société »). Toutes les fonctions
`cfgRender*` peuplent l'UI depuis l'état courant au chargement de la page (`init()`).
Après publication, `OI_CONFIG`/`OI_LIST`/`COMPETENCE_LIST`/`PERIODES_PAR_NIVEAU`/
`ASPECTS_PAR_PERIODE` sont mutés en place (ce sont des `const` — jamais réassignés) pour
que le reste de la page (selects, dashboard) reflète la nouvelle config sans recharger.

`loadConfigJs()` (`init()`, en parallèle de `loadQuestionsJs()`) : `oi-config.js`/`contexte.js`/
`competences.js` sont chargés en `<script src>` statique, donc soumis au même risque de cache
CDN GitHub Pages périmé que `questions.js` (voir section Latence plus bas) — après une
publication Configuration depuis cette page, le menu OI/les sociétés peuvent rester périmés
tant que la page n'est pas rechargée. `loadConfigJs()` relit les 3 fichiers via l'API GitHub
(anonyme, dépôt public) au chargement, mute les mêmes globals en place, puis rappelle
`populateOiSelect`/`populateNiveauSelects`/`populateCompetenceSelect`/`cfgRender*`/
`updatePeriodes`/`updatePresets` — silencieux en cas d'échec (page reste utilisable avec les
données du `<script src>` déjà peintes).

`_putFileWithRetry(path, message, build)` factorise la lecture SHA + PUT + un seul
retry sur conflit 409 — **pas** la choréographie de double-lecture stabilisée de
`fetchFreshStateStable` (utilisée pour `questions.js`) : ces fichiers de config changent
rarement et à la main, un simple retry suffit. Si un jour plusieurs personnes éditent la
config en parallèle, il faudrait durcir cette fonction sur le même modèle que
`fetchFreshStateStable`.

---

## Structure des données

### Question (`QUESTIONS[i]`)
```js
{
  id: 'Q1',
  niveau: 3,                           // clé de PERIODES_PAR_NIVEAU (nombre, ex. worker/index.js le valide comme entier)
  oi: 'Nom exact d'une clé de OI_CONFIG',            // 8 choix, voir oi-config.js
  competence: 'Nom exact d'une entrée de COMPETENCE_LIST',  // optionnel, 3 choix, voir competences.js
  periodes: ['Nom d'une société de PERIODES_PAR_NIVEAU[niveau]'],  // TABLEAU — 1 société, ou 2 pour une comparaison
  points: 2,
  soustag: '...',                      // optionnel, doit être dans OI_CONFIG[oi].soustags
  enonce: 'Texte avec **gras** et • puces',
  aspects: [{ aspect: 'Nom exact d'un aspect présent dans ASPECTS_PAR_PERIODE[une des periodes]' }],
  documents: [{
    type: 'textes',
    cols: [{ titre: '...', soustitre: '', texte: '...', /* ou ref: 'image.png' */ auteur: '', source: '' }]
  }],
  reponse: false | true | { type: '...' },
  guide: 'Texte' | { type: 'grille', entetes: [], rangees: [[]] } | false
}
```

### OI (`OI_CONFIG[nom]`, oi-config.js)
```js
{
  color: 'var(--c-slot3)', bg: 'var(--c-slot3-bg)',   // 1 des 8 préréglages de style.css
  soustags: ['Type A', 'Type B'],                       // optionnel
  autoReponse: { type: 'lignes', nombre: 2 }            // optionnel
}
```

### Compétence (`COMPETENCE_LIST`, competences.js)
Simple tableau de chaînes — pas d'objet, pas de couleur/réglette (celles-ci restent
portées par l'OI, dimension indépendante) :
```js
const COMPETENCE_LIST = ["Lire l'organisation du territoire", 'Interpréter le changement', "S'ouvrir à la diversité"]
```

### Contexte (contexte.js) — « société » à l'affichage, champ interne toujours `periode`
```js
PERIODES_PAR_NIVEAU = { '3': ['Les Iroquoiens vers 1500', 'Les Algonquiens vers 1500', ...] }
ASPECTS_PAR_PERIODE = { 'Les Iroquoiens vers 1500': ['Territoire', 'Personnages', ...], ... }
```
Niveau 3 : 4 sociétés, 10 aspects communs à toutes (Territoire, Personnages, Population,
Groupes sociaux, Vie quotidienne, Culture, Activités économiques, Communication,
Transport, Gouvernement).

### Réglette (`REGLETTES['Q1']`)
```js
{
  oi: 'Nom de l'OI',
  colonnes: ['Critères', 'Niv. 1', 'Niv. 2'],
  niveaux: [{ pts: 1, desc: '...' }, { pts: 2, desc: '...' }]
}
```

---

## Push Git

Essayer d'abord le push normal (`git push -u origin <branche>`). Sinon, demander le PAT
au prof dans le chat et pousser via HTTPS direct :
```bash
PAT=<TOKEN fourni dans le chat — JAMAIS écrit dans un fichier du dépôt>
BRANCH=<branche de travail de la session>

git fetch https://sbergeronencp002:${PAT}@github.com/sbergeronencp002/ghec.git +main:refs/remotes/origin/main_fresh
git checkout -B main refs/remotes/origin/main_fresh
git merge $BRANCH --no-edit

git push https://sbergeronencp002:${PAT}@github.com/sbergeronencp002/ghec.git HEAD:main
git push https://sbergeronencp002:${PAT}@github.com/sbergeronencp002/ghec.git HEAD:${BRANCH}

git fetch https://sbergeronencp002:${PAT}@github.com/sbergeronencp002/ghec.git +main:refs/remotes/origin/main
git fetch https://sbergeronencp002:${PAT}@github.com/sbergeronencp002/ghec.git +${BRANCH}:refs/remotes/origin/${BRANCH}
```

---

## Images

Toujours compresser les PNG avec `pngquant` avant de commiter (un hook `PostToolUse`
le fait déjà automatiquement pour les fichiers `images/*.png` écrits par Claude) :
```bash
pngquant --force --quality=65-85 --output <fichier>.png <fichier>.png
```

---

## ⚠️ Latence de propagation de l'API GitHub

L'API Contents de GitHub n'est **pas instantanément cohérente** entre ses réplicas de
lecture. Sous des écritures rapprochées sur le même fichier, une « lecture fraîche »
censée précéder une écriture peut renvoyer un état antérieur au commit précédent
(jusqu'à ~35-45 s de retard observé sur hqccssbf), et la 2ᵉ écriture peut alors écraser
silencieusement la 1ʳᵉ, même sans conflit 409 (les deux lectures/écritures ont
simplement touché des réplicas différents).

Parade actuelle sur `questions.js` : `fetchFreshStateStable` (admin.html) relit deux
fois de suite espacées de 3 s et n'accepte la lecture que si les deux SHA concordent ;
si l'état ainsi lu est quand même en retard par rapport à ce que la session sait déjà
avoir publié avec succès (`confirmedIds`), `_assignFreshState` réinjecte ces entrées
plutôt que de les perdre. Ce filet de sécurité **n'existe pas** pour `oi-config.js`/
`contexte.js` (`_putFileWithRetry`, un seul retry simple) — acceptable tant que ces
fichiers ne sont édités qu'à la main, rarement, une personne à la fois.

⚠️ **Ce n'est pas le même problème** que le cache CDN de GitHub Pages : celui-ci concerne
l'API elle-même (dépôt), l'autre concerne le site déployé. Symptôme observé (2026-07-23) :
le menu OI/les sociétés dans admin.html restaient parfois périmés après une publication
Configuration depuis la même page, jusqu'à un rechargement manuel — parce que
`oi-config.js`/`contexte.js`/`competences.js` sont chargés en `<script src>` statique,
sans cache-bust qui change à chaque publication (contrairement à `questions.js`, chargé en
lazy avec cache-bust par timestamp). Corrigé par `loadConfigJs()` (voir section
Configuration ci-dessus) : relecture via l'API GitHub au chargement d'admin.html, qui
reflète toujours l'état réel du dépôt contrairement au CDN Pages.

---

## Worker Cloudflare (voie de publication rapide) — déployé et actif depuis le 2026-08-17

`admin.html` publie via un Worker Cloudflare (`/publish` pour les questions, `/upload-image`
pour les images) au lieu du PUT GitHub direct — voie prioritaire quand configurée (champs
« URL Worker »/« Worker Secret » dans l'UI, déjà remplis chez l'enseignant), avec repli
sur PUT direct si le Worker est indisponible. `workerUrl`/`workerSecret` sont stockés en
clair dans `localStorage` du navigateur — jamais commités.

**Pourquoi ça existe** : le réseau de l'école de l'enseignant bloque les requêtes HTTP
d'écriture (PUT/POST authentifiées) faites en JavaScript vers `api.github.com` depuis le
navigateur — diagnostiqué le 2026-08-17 (signature : GET simple → OK, PUT → toujours
`net::ERR_FAILED 503` + erreur CORS incohérente, peu importe la taille du contenu ; la
navigation normale et le formulaire d'upload natif de github.com fonctionnent, eux). Le
Worker tourne sur l'infrastructure Cloudflare (le navigateur ne parle qu'à
`*.workers.dev`), donc contourne ce blocage à la racine plutôt que d'attendre qu'il se
débloque.

**Déploiement** : `.github/workflows/deploy-worker.yml`, déclenché automatiquement sur push
`worker/**`→`main`, ou manuellement (`workflow_dispatch`). Nécessite 3 secrets du dépôt
(Settings → Secrets and variables → Actions) : `CLOUDFLARE_API_TOKEN` (modèle **« Edit
Cloudflare Workers »** — un jeton avec des permissions personnalisées a échoué une première
fois, code d'erreur Cloudflare 10000/Authentication error), `GH_PAT_WORKER` (PAT GitHub
scope `repo`, distinct du token personnel utilisé pour la voie directe), `WORKER_SECRET`
(clé partagée arbitraire). Compte Cloudflare partagé avec HQC (même `accountId` dans les
deux dépôts). Nom du Worker : `ghec-admin` → URL `https://ghec-admin.sbergeron-ens.workers.dev`.

Je (l'agent) ne peux pas lire ni modifier les secrets du dépôt ni le token de
l'enseignant — cette action GitHub Actions/Secrets spécifique est bloquée pour mon accès
API, contrairement aux publications de fichiers. L'enseignant doit toujours les
créer/coller lui-même dans les paramètres du dépôt.
