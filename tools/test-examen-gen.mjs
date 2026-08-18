#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Tests — algorithme de génération d'examens (GHEC · CSSBF)
//
// examen-gen.js est référencé depuis son propre en-tête comme "testable
// directement via node (voir tools/test-examen-gen.mjs)" mais ce fichier
// n'existait pas — l'algorithme le plus complexe du dépôt (exact-cover des
// aspects + budget de points + quota OI) n'avait donc aucune couverture
// automatisée. Charge examen-gen.js via require() (le fichier reste un
// <script> classique pour examen.html — pas de build, cohérent avec le
// reste du projet — mais expose un module.exports CommonJS en fin de
// fichier utilisable depuis Node) et exerce l'algorithme sur un petit jeu
// de questions synthétique, sans dépendance à questions.js réel.
//
// Usage :  node tools/test-examen-gen.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const eg = require(join(ROOT, 'examen-gen.js'));

let failed = 0;
function check(label, cond) {
  if (cond) { console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label); }
}
function section(title) { console.log('\n' + title); }

// ── Jeu de questions synthétique ──────────────────────────────────────────────
// 3 aspects (Territoire/Personnages/Culture), 2 OI (OI-A/OI-B), une société « P-Test ».
function mkQ(id, oi, aspects, points, soustag) {
  return { id, oi, points, soustag: soustag || '', periodes: ['P-Test'], aspects: aspects.map(a => ({ aspect: a })) };
}
const questions = [
  mkQ('Q1', 'OI-A', ['Territoire'], 2, 'a'),
  mkQ('Q2', 'OI-A', ['Personnages'], 1, 'b'),
  mkQ('Q3', 'OI-B', ['Culture'], 2, 'c'),
  mkQ('Q4', 'OI-B', ['Territoire'], 1, 'd'),
  mkQ('Q5', 'OI-A', ['Culture'], 2, 'e'),
];
const ASPECTS = ['Territoire', 'Personnages', 'Culture'];
const OIS = ['OI-A', 'OI-B'];

// ── exGenererExamen : cas de base ─────────────────────────────────────────────
section('exGenererExamen — cas de base');
{
  const r = eg.exGenererExamen({ questions, periode: 'P-Test', aspects: ASPECTS, oiList: OIS, favoriOi: null, maxPoints: 25 });
  check('génère un examen valide (ok:true)', r.ok === true);
  if (r.ok) {
    const coveredAspects = new Set(r.selected.flatMap(eg.exAspectsOf));
    check('couvre les 3 aspects du programme', ASPECTS.every(a => coveredAspects.has(a)));
    const usedOis = new Set(r.selected.map(q => q.oi));
    check('variété : les 2 OI sont représentées', OIS.every(oi => usedOis.has(oi)));
    check('respecte le budget de points', r.points <= 25);
  }
}

// ── Court-circuit : société sans aucune question ──────────────────────────────
section('exGenererExamen — société sans question');
{
  const r = eg.exGenererExamen({ questions, periode: 'P-Inexistante', aspects: ASPECTS, oiList: OIS, favoriOi: null });
  check('échoue avec un message dédié (pas générique)', r.ok === false && r.reason.includes('Aucune question saisie'));
}

// ── Court-circuit : aspect sans aucun candidat ────────────────────────────────
section('exGenererExamen — aspect sans aucun candidat');
{
  const r = eg.exGenererExamen({ questions, periode: 'P-Test', aspects: [...ASPECTS, 'Aspect-Inexistant'], oiList: OIS, favoriOi: null });
  check('échoue avec un message nommant l\'aspect fautif (pas générique)',
    r.ok === false && r.reason.includes('Aspect-Inexistant') && r.reason.includes('Aucune question ne couvre'));
}

// ── Piège EX_OI_FIXED_TARGET(_BY_PERIODE) = 0 sans exclusion de variété ──────
section('exGenererExamen — cible fixe à 0 sans exclusion de variété');
{
  eg.EX_OI_FIXED_TARGET_BY_PERIODE['P-Test'] = { 'OI-B': 0 };
  const r = eg.exGenererExamen({ questions, periode: 'P-Test', aspects: ASPECTS, oiList: OIS, favoriOi: null });
  check('refusé immédiatement avec un message de configuration dédié (pas de blocage silencieux après ~150+ tentatives)',
    r.ok === false && r.reason.includes('Configuration incohérente') && r.reason.includes('OI-B'));
  delete eg.EX_OI_FIXED_TARGET_BY_PERIODE['P-Test'];
}

// ── Même config, mais correctement doublée d'une exclusion de variété ────────
section('exGenererExamen — cible à 0 + exclusion de variété (config correcte)');
{
  eg.EX_OI_FIXED_TARGET_BY_PERIODE['P-Test'] = { 'OI-B': 0 };
  eg.EX_OI_VARIETY_EXCLUDE_BY_PERIODE['P-Test'] = ['OI-B'];
  const r = eg.exGenererExamen({ questions, periode: 'P-Test', aspects: ASPECTS, oiList: OIS, favoriOi: null });
  check('génère sans bloquer, et sans aucune question OI-B',
    r.ok === true && r.selected.length > 0 && !r.selected.some(q => q.oi === 'OI-B'));
  delete eg.EX_OI_FIXED_TARGET_BY_PERIODE['P-Test'];
  delete eg.EX_OI_VARIETY_EXCLUDE_BY_PERIODE['P-Test'];
}

// ── exOiCap ────────────────────────────────────────────────────────────────
section('exOiCap');
check('sans cible fixe ni favori ni plafond dur → illimité', eg.exOiCap('X', null, 0, {}) === Infinity);
check('cible fixe à 0 → plafond 0', eg.exOiCap('X', null, 0, { X: 0 }) === 0);
check('OI favorite avec cible → plafond = cible', eg.exOiCap('X', 'X', 3, {}) === 3);

// ── exFixedTargetLevels ───────────────────────────────────────────────────────
section('exFixedTargetLevels');
{
  const levels = eg.exFixedTargetLevels({ A: 3, B: 1 });
  check('dégrade du plus ambitieux (3) au plancher (1)', levels.length === 3);
  check('dernier palier = 1 pour chaque clé', levels[levels.length - 1].A === 1 && levels[levels.length - 1].B === 1);
  check('table vide → un seul palier vide', eg.exFixedTargetLevels({}).length === 1);
}

// ── exRemapTitre / exHasDocCitation ───────────────────────────────────────────
section('exRemapTitre / exHasDocCitation');
check('remplace "Document A" par le numéro global', eg.exRemapTitre('Document A — Une lettre', 5) === 'Document 5 — Une lettre');
check('titre sans le format attendu → préfixe le numéro', eg.exRemapTitre('Sans format', 2) === 'Document 2 — Sans format');
check('titre vide → juste "Document N"', eg.exRemapTitre('', 1) === 'Document 1');
check('détecte une citation "documents A à C"', eg.exHasDocCitation('Voir les documents A à C') === true);
check('aucune citation → false', eg.exHasDocCitation('Rien ici') === false);

// ── exReorderNoAdjacentOi : invariant (aucune perte/duplication de question) ──
section('exReorderNoAdjacentOi');
{
  const list = [
    { id: 'a', oi: 'OI-A' }, { id: 'b', oi: 'OI-A' }, { id: 'c', oi: 'OI-B' }, { id: 'd', oi: 'OI-B' },
  ];
  const reordered = eg.exReorderNoAdjacentOi(list);
  check('conserve le même nombre de questions', reordered.length === list.length);
  check('conserve exactement le même multi-ensemble d\'ids',
    JSON.stringify(reordered.map(q => q.id).sort()) === JSON.stringify(list.map(q => q.id).sort()));
}

// ── Rapport ────────────────────────────────────────────────────────────────
console.log('');
if (failed) {
  console.log(`✗ ${failed} test(s) en échec.`);
  process.exit(1);
}
console.log('✓ Tous les tests de examen-gen.js passent.');
