#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Scanner anti-XSS — GHEC · CSSBF
//
// Heuristique (PAS une preuve formelle) : repère les lignes qui construisent
// visiblement un fragment HTML (contiennent un littéral avec une balise, ex.
// "<td", "<div", "<img", "src=\"") et y interpolent un champ de donnée connu
// (oi, titre, texte, auteur…) SANS passer par une fonction d'échappement
// (escLine / escAttr / jsStr / rvEscLine / rvEscAttr / escH). C'est exactement
// la classe de bug corrigée lors de l'audit du 2026-07-05 (OI non échappée
// dans les réglettes complexes, src d'image non échappé, alt= non échappé).
//
// Faux positifs possibles → suppression ligne par ligne avec le marqueur
// de commentaire `esc-ok` sur la même ligne.
// Faux négatifs probables sur des expressions complexes (chaînes multi-lignes,
// fonctions intermédiaires) : ce script est un filet de sécurité, pas un audit.
//
// Usage :  node tools/check-escaping.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['app.js', 'admin.html', 'documents.html', 'revision.html', 'examen.html'];

// Champs de données textuelles susceptibles de contenir du HTML saisi par un humain.
const FIELDS = ['oi','titre','soustitre','texte','auteur','source','enonce','guide',
  'label','aspect','desc','valeur','col1','col2','col3','ref','periode'].join('|');

const ESCAPE_FNS = ['escLine','escAttr','jsStr','rvEscLine','rvEscAttr','escH','escHtml'];

// Une balise/attribut HTML littéral sur la ligne = signal qu'on construit du HTML.
const HTML_SIGNAL = /<(td|div|span|tr|th|img|table|p|li|ul|option|strong|a|button|label)\b|(src|alt|href|title)=["']/i;

// ${expr} où expr est un accès de propriété "nu" (pas d'appel de fonction autour).
const TEMPLATE_FIELD = new RegExp(`\\$\\{\\s*([A-Za-z_$][\\w$]*(?:\\.(?:${FIELDS}))+)\\s*(\\|\\|[^}]*)?\\}`, 'g');
// + champ.nu + (concaténation classique 'html' + col.titre + '</td>')
const CONCAT_FIELD = new RegExp(`\\+\\s*([A-Za-z_$][\\w$]*(?:\\.(?:${FIELDS}))+)\\s*\\+`, 'g');

let findings = 0;

for (const file of FILES) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('esc-ok')) return;
    if (!HTML_SIGNAL.test(line)) return;

    const hits = new Set();
    for (const m of line.matchAll(TEMPLATE_FIELD)) hits.add(m[1]);
    for (const m of line.matchAll(CONCAT_FIELD)) hits.add(m[1]);
    if (!hits.size) return;

    // Si la ligne appelle déjà une fonction d'échappement sur CE champ précis, on l'ignore
    // (ex. escLine(col.titre) ne matche déjà pas nos regex ci-dessus, mais on reste prudent
    // si le même nom de champ apparaît deux fois sur la ligne, une fois échappée une fois non).
    for (const field of hits) {
      const wrapped = ESCAPE_FNS.some(fn => line.includes(`${fn}(${field})`) || line.includes(`${fn}(${field}||`) || line.includes(`${fn}(${field}.`));
      if (wrapped) continue;
      findings++;
      console.log(`  - ${file}:${i + 1} — « ${field} » interpolé sans échappement dans un contexte HTML`);
      console.log(`      ${line.trim().slice(0, 140)}`);
    }
  });
}

if (findings) {
  console.log(`\n✗ ${findings} interpolation(s) potentiellement non échappée(s).`);
  console.log('  Si c\'est un faux positif, ajouter le marqueur `esc-ok` en commentaire sur la ligne.');
  process.exit(1);
}
console.log('✓ Aucune interpolation HTML non échappée détectée (scanner heuristique).');
