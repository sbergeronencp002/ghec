#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Validateur d'intégrité des données — GHEC · CSSBF
//
// Vérifie questions.js (REGLETTES / IMAGE_DB / QUESTIONS) contre oi-config.js,
// contexte.js et les fichiers réellement présents dans images/.
//
// Usage :  node tools/validate-questions.mjs
// Sortie :  code 0 si aucune ERREUR (les AVERTISSEMENTS n'échouent pas le script).
//
// Pensé pour tourner en filet de sécurité (hook SessionStart ou CI) après les
// éditions manuelles de questions.js (admin.html / documents.html).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

// Charge les fichiers de données (du code source pur, pas de modules) dans un scope isolé.
function loadGlobals() {
  const src = [read('oi-config.js'), read('competences.js'), read('contexte.js'), read('questions.js')].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(
    src + '\n return { OI_CONFIG, COMPETENCE_LIST, PERIODES_PAR_NIVEAU, ASPECTS_PAR_PERIODE, REGLETTES, IMAGE_DB, QUESTIONS };'
  )();
}

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

let G;
try {
  G = loadGlobals();
} catch (e) {
  console.error('✗ Impossible de charger/parser les fichiers de données : ' + e.message);
  process.exit(1);
}
const { OI_CONFIG, COMPETENCE_LIST, PERIODES_PAR_NIVEAU, ASPECTS_PAR_PERIODE, REGLETTES, IMAGE_DB, QUESTIONS } = G;

// Fichiers image réellement présents sur le disque.
const imageFiles = new Set(
  readdirSync(join(ROOT, 'images')).filter((f) => !f.startsWith('.'))
);

const VALID_REPONSE_TYPES = new Set([
  'lignes', 'image', 'tableau', 'grille', 'tableau_2col', 'tableau_3col',
  'cause-consequence', 'mettre-en-relation', 'situer-dans-lespace', 'avant-apres',
]);
const VALID_GUIDE_TYPES = new Set(['grille', 'tableau']);

const oiKeys = new Set(Object.keys(OI_CONFIG));
const competenceKeys = new Set(COMPETENCE_LIST);
const periodeToNiveau = {};
for (const [niv, periodes] of Object.entries(PERIODES_PAR_NIVEAU)) {
  for (const p of periodes) periodeToNiveau[p] = niv;
}

// ── QUESTIONS ────────────────────────────────────────────────────────────────
const seenIds = new Set();
const usedRefs = new Set();

for (const q of QUESTIONS) {
  const tag = q.id || '(sans id)';

  if (!q.id) err(`Question sans id : ${JSON.stringify(q).slice(0, 60)}…`);
  else if (seenIds.has(q.id)) err(`Id en double : ${q.id}`);
  else seenIds.add(q.id);

  if (!oiKeys.has(q.oi)) err(`${tag} : OI inconnue « ${q.oi} » (absente d'oi-config.js)`);
  else if (q.soustag) {
    const validSoustags = OI_CONFIG[q.oi].soustags || [];
    if (!validSoustags.includes(q.soustag)) {
      err(`${tag} : sous-tag « ${q.soustag} » absent de la liste de « ${q.oi} » dans oi-config.js`);
    }
  }

  if (q.competence && !competenceKeys.has(q.competence)) {
    err(`${tag} : compétence inconnue « ${q.competence} » (absente de competences.js)`);
  }

  if (q.reponse && typeof q.reponse === 'object' && !VALID_REPONSE_TYPES.has(q.reponse.type)) {
    err(`${tag} : type de réponse inconnu « ${q.reponse.type} »`);
  }
  if (q.guide && typeof q.guide === 'object' && !VALID_GUIDE_TYPES.has(q.guide.type)) {
    err(`${tag} : type de guide inconnu « ${q.guide.type} »`);
  }

  const niv = String(q.niveau);
  const periodes = q.periodes || [];
  if (!periodes.length) err(`${tag} : aucune société (periodes vide ou absent)`);
  if (periodes.length > 2) warn(`${tag} : plus de 2 sociétés (${periodes.length}) — attendu 1, ou 2 pour une comparaison`);
  if (!PERIODES_PAR_NIVEAU[niv]) {
    const attendus = Object.keys(PERIODES_PAR_NIVEAU).join(' ou ') || '(aucun niveau configuré)';
    err(`${tag} : niveau invalide « ${q.niveau} » (attendu ${attendus})`);
  } else {
    for (const p of periodes) {
      if (!PERIODES_PAR_NIVEAU[niv].includes(p)) err(`${tag} : société « ${p} » absente du niveau ${niv}`);
    }
  }

  // Aspects : doivent appartenir à au moins une des sociétés de la question (avertissement, non bloquant).
  const validAspects = new Set(periodes.flatMap(p => ASPECTS_PAR_PERIODE[p] || []));
  for (const a of q.aspects || []) {
    if (a.aspect && !validAspects.has(a.aspect)) {
      warn(`${tag} : aspect « ${a.aspect} » non listé pour ${periodes.join(' + ') || '(aucune société)'}`);
    }
  }

  // Références d'images dans les documents.
  for (const doc of q.documents || []) {
    for (const col of doc.cols || []) {
      if (!col.ref) continue;
      usedRefs.add(col.ref);
      if (!imageFiles.has(col.ref)) err(`${tag} : image manquante sur le disque « ${col.ref} »`);
      if (!IMAGE_DB[col.ref]) warn(`${tag} : « ${col.ref} » absente d'IMAGE_DB (sera ajoutée à la publication)`);
    }
  }
  if (q.reponse && q.reponse.ref) {
    usedRefs.add(q.reponse.ref);
    if (!imageFiles.has(q.reponse.ref)) err(`${tag} : image-réponse manquante « ${q.reponse.ref} »`);
  }

  // Réglette associée.
  const r = REGLETTES[q.id];
  if (r && r.oi && r.oi !== q.oi) {
    warn(`${tag} : OI de la réglette (« ${r.oi} ») ≠ OI de la question (« ${q.oi} »)`);
  }
}

// ── REGLETTES orphelines ─────────────────────────────────────────────────────
for (const id of Object.keys(REGLETTES)) {
  if (!seenIds.has(id)) warn(`Réglette orpheline « ${id} » (aucune question correspondante)`);
}

// ── IMAGE_DB ↔ disque ────────────────────────────────────────────────────────
for (const key of Object.keys(IMAGE_DB)) {
  if (!imageFiles.has(key)) warn(`IMAGE_DB référence « ${key} » mais le fichier est absent du disque`);
}

// ── Images non utilisées / lourdes ───────────────────────────────────────────
let heavy = 0;
for (const f of imageFiles) {
  if (!usedRefs.has(f)) warn(`Image non utilisée (orpheline) : ${f}`);
  const kb = statSync(join(ROOT, 'images', f)).size / 1024;
  if (kb > 500) { heavy++; }
}
if (heavy) warn(`${heavy} image(s) > 500 Ko — envisager une compression (pngquant).`);

// ── Rapport ──────────────────────────────────────────────────────────────────
console.log(`Questions : ${QUESTIONS.length} · Réglettes : ${Object.keys(REGLETTES).length} · IMAGE_DB : ${Object.keys(IMAGE_DB).length} · Fichiers images : ${imageFiles.size}`);
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} avertissement(s) :`);
  for (const w of warnings) console.log('  - ' + w);
}
if (errors.length) {
  console.log(`\n✗ ${errors.length} ERREUR(S) :`);
  for (const e of errors) console.log('  - ' + e);
  process.exit(1);
}
console.log('\n✓ Aucune erreur bloquante.');
