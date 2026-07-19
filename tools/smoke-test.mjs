#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Tests de fumée — fonctions de rendu critiques (GHEC · CSSBF)
//
// Charge oi-config.js / contexte.js / app.js dans un contexte vm Node (avec un
// DOM minimal factice) et exerce les fonctions de construction HTML pure avec
// des entrées adverses (OI/titres/textes contenant des caractères HTML), pour
// détecter les régressions XSS et les crashs sur données incomplètes AVANT
// publication — sans dépendance npm (aucun jsdom), pour rester cohérent avec
// un site 100 % statique sans étape de build.
//
// Usage :  node tools/smoke-test.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

let failed = 0;
function check(label, cond) {
  if (cond) { console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label); }
}
function section(title) { console.log('\n' + title); }

// ── DOM minimal : juste assez pour que app.js se charge sans planter ─────────
// (les fonctions testées ci-dessous sont des constructeurs de chaînes HTML qui
// ne touchent pas le DOM ; seul le chargement du fichier référence document/window.)
const fakeEl = () => ({ innerHTML: '', value: '', style: {}, classList: { add(){}, remove(){}, contains(){return false;} }, appendChild(){}, addEventListener(){} });
const sandbox = {
  console,
  document: { getElementById: () => fakeEl(), addEventListener(){}, createElement: () => fakeEl(), querySelectorAll: () => [] },
  window: { addEventListener(){} },
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  fetch: () => Promise.reject(new Error('fetch non disponible en test de fumée')),
};
vm.createContext(sandbox);

vm.runInContext(read('oi-config.js'), sandbox, { filename: 'oi-config.js' });
vm.runInContext(read('contexte.js'), sandbox, { filename: 'contexte.js' });
vm.runInContext(read('app.js'), sandbox, { filename: 'app.js' });

// ── escLine / escAttr / jsStr : les payloads XSS classiques doivent ressortir inertes ──
section('Échappement (escLine / escAttr / jsStr)');
const XSS = '<script>alert(1)</script>"\'&';
const escaped = sandbox.escLine(XSS);
check('escLine neutralise < > &', !escaped.includes('<script>') && !escaped.includes('</script>'));
const escapedAttr = sandbox.escAttr(XSS);
check('escAttr neutralise aussi les guillemets doubles', !escapedAttr.includes('"'));
const escapedJs = sandbox.jsStr(`a'); alert(1); //`);
// Toute apostrophe restante doit être précédée d'un antislash (sinon elle clôturerait
// prématurément la chaîne JS dans un contexte onclick="foo('...')").
const hasUnescapedQuote = /(^|[^\\])'/.test(escapedJs);
check("jsStr échappe toutes les apostrophes (casse de onclick=\"...('...')\")", !hasUnescapedQuote);

// ── buildReglettHTML : les 3 variantes complexes + la variante standard, avec OI adverse ──
section('buildReglettHTML (réglettes) — OI contenant un payload XSS');
const maliciousOi = '<img src=x onerror=alert(1)>';
const variantes = ['3 éléments — 2 liens', 'acteur-positions', 'changement-continuité'];
for (const variante of variantes) {
  sandbox.REGLETTES = { Q1: { oi: maliciousOi, variante, colonnes: [], niveaux: [] } };
  const html = sandbox.buildReglettHTML({ id: 'Q1' });
  check(`variante « ${variante} » échappe l'OI`, !html.includes('<img src=x onerror'));
}
sandbox.REGLETTES = { Q1: { oi: maliciousOi, colonnes: ['Critères', 'Niv. 1'], niveaux: [{ pts: 1, desc: maliciousOi }] } };
check('variante standard échappe l\'OI et les descriptions', !sandbox.buildReglettHTML({ id: 'Q1' }).includes('onerror=alert'));

// ── formatTexte : gras + puces, doit échapper le HTML brut du texte source ────
section('formatTexte');
const txt = sandbox.formatTexte('**gras** et <b>faux gras</b>\n• puce <i>x</i>');
check('formatTexte échappe les balises du texte source', !txt.includes('<b>faux gras</b>') && !txt.includes('<i>x</i>'));
check('formatTexte convertit bien **gras** en <strong>', txt.includes('<strong>gras</strong>'));

// ── docsForRender : fusion 2/4 documents « textes » mono-colonne ─────────────
section('docsForRender');
const docs2 = [{ type: 'textes', cols: [{ titre: 'A' }] }, { type: 'textes', cols: [{ titre: 'B' }] }];
const merged2 = sandbox.docsForRender(docs2);
check('fusionne 2 documents textes en 1 rangée de 2 colonnes', merged2.length === 1 && merged2[0].cols.length === 2 && merged2[0].colsPerRow === 2);
const docsOther = [{ type: 'tableau', cols: [] }];
check('ne fusionne pas les documents non « textes »', sandbox.docsForRender(docsOther).length === 1);
check('tableau vide → tableau vide (pas de crash)', Array.isArray(sandbox.docsForRender([])) && sandbox.docsForRender([]).length === 0);

// ── Rapport ────────────────────────────────────────────────────────────────
console.log('');
if (failed) {
  console.log(`✗ ${failed} test(s) de fumée en échec.`);
  process.exit(1);
}
console.log('✓ Tous les tests de fumée passent.');
