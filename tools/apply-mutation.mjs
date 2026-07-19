// Script exécuté par la GitHub Action "publish-question".
// Lit questions.js, applique la mutation depuis PAYLOAD, réécrit le fichier.

import { readFileSync, writeFileSync } from 'fs';

const payload = JSON.parse(process.env.PAYLOAD);
const { action, question, reglette, editingId } = payload;

if (!question?.id) { console.error('question.id manquant'); process.exit(1); }
// Voir le commentaire équivalent dans worker/index.js : editingId et question.id ne devraient
// jamais diverger (le champ id est verrouillé côté client dès qu'on édite) — un écart signale
// un client obsolète qui remplacerait silencieusement la mauvaise question.
if (action !== 'delete' && editingId && editingId !== question.id) {
  console.error(`editingId (${editingId}) ne correspond pas à question.id (${question.id}) — mutation refusée`);
  process.exit(1);
}

// Copie EXACTE de validateQuestionPayload (worker/index.js) : cette voie (repository_dispatch,
// fallback quand le Worker est inaccessible) écrit directement sur main sans autre validation —
// sans ce garde-fou, une mutation malformée (oi/niveau/periode/enonce/documents/aspects manquant
// ou du mauvais type) corromprait questions.js et casserait le rendu pour tous les visiteurs.
function validateQuestionPayload(q) {
  if (typeof q !== 'object' || q === null) return 'question invalide';
  if (typeof q.id !== 'string' || !/^Q\d+$/.test(q.id)) return 'question.id invalide (attendu "Q" suivi de chiffres)';
  if (typeof q.oi !== 'string' || !q.oi) return 'question.oi manquant';
  if (q.niveau !== 3 && q.niveau !== 4) return 'question.niveau invalide (attendu 3 ou 4)';
  if (typeof q.periode !== 'string' || !q.periode) return 'question.periode manquant';
  if (typeof q.enonce !== 'string') return 'question.enonce manquant';
  if (q.documents !== undefined && !Array.isArray(q.documents)) return 'question.documents doit être un tableau';
  if (q.aspects !== undefined && !Array.isArray(q.aspects)) return 'question.aspects doit être un tableau';
  return null;
}
if (action !== 'delete') {
  const payloadError = validateQuestionPayload(question);
  if (payloadError) { console.error('Payload invalide: ' + payloadError); process.exit(1); }
}

// ── Lire et parser questions.js ──────────────────────────────────────────────
const content = readFileSync('questions.js', 'utf-8');
let QUESTIONS, REGLETTES, IMAGE_DB;
try {
  const fn = new Function(content + '\nreturn { QUESTIONS, REGLETTES, IMAGE_DB };');
  ({ QUESTIONS, REGLETTES, IMAGE_DB } = fn());
} catch(e) { console.error('Parse error:', e.message); process.exit(1); }

// ── Appliquer la mutation ────────────────────────────────────────────────────
if (action === 'delete') {
  const idx = QUESTIONS.findIndex(q => q.id === question.id);
  if (idx !== -1) QUESTIONS.splice(idx, 1);
  delete REGLETTES[question.id];
} else {
  if (editingId) {
    const idx = QUESTIONS.findIndex(q => q.id === editingId);
    if (idx !== -1) QUESTIONS[idx] = question; else QUESTIONS.push(question);
    if (editingId !== question.id) delete REGLETTES[editingId];
  } else {
    if (QUESTIONS.find(q => q.id === question.id)) {
      console.error(`ID ${question.id} existe déjà`); process.exit(1);
    }
    QUESTIONS.push(question);
  }
  REGLETTES[question.id] = reglette || {};
}

// ── Compléter IMAGE_DB ───────────────────────────────────────────────────────
QUESTIONS.forEach(q => {
  q.documents?.forEach(d => d.cols?.forEach(c => {
    if (c.ref && !IMAGE_DB[c.ref]) IMAGE_DB[c.ref] = { src: 'images/' + c.ref };
  }));
  if (q.reponse?.ref && !IMAGE_DB[q.reponse.ref]) IMAGE_DB[q.reponse.ref] = { src: 'images/' + q.reponse.ref };
});

// ── Sérialiseur (copie EXACTE de questions-io.js — voir la note dans worker/index.js ;
//    les trois copies avaient divergé, provoquant un reformatage complet de questions.js
//    à chaque alternance de voie de publication. Resynchronisé le 2026-07-09.) ──────────
function _isScalar(v) {
  return v === null || v === undefined || v === false || v === true || typeof v === 'number' || typeof v === 'string';
}
function _isFlat(v) {
  if(_isScalar(v)) return true;
  if(Array.isArray(v) || typeof v !== 'object' || v === null) return false;
  return Object.values(v).every(_isScalar);
}
function serializeValue(v, indent=0) {
  const pad = ' '.repeat(indent);
  const pad1 = ' '.repeat(indent+1);
  if(_isScalar(v)) return v === null || v === undefined ? 'null' : typeof v === 'string' ? JSON.stringify(v) : String(v);
  if(Array.isArray(v)) {
    if(!v.length) return '[]';
    const items = v.map(i => serializeValue(i, indent+1));
    const oneLine = '[' + items.join(', ') + ']';
    if(oneLine.length <= 500) return oneLine;
    return '[\n' + items.map(i => pad1 + i).join(',\n') + '\n' + pad + ']';
  }
  const entries = Object.entries(v);
  if(!entries.length) return '{}';
  const fmtKey = k => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
  const pairs = entries.map(([k,val]) => fmtKey(k) + ': ' + serializeValue(val, indent+1));
  const oneLine = '{' + pairs.join(', ') + '}';
  if(oneLine.length <= 500) return oneLine;
  return '{\n' + pairs.map(p => pad1 + p).join(',\n') + '\n' + pad + '}';
}

let out = 'const REGLETTES = {\n';
out += Object.entries(REGLETTES).map(([k,v]) => `${JSON.stringify(k)}: ${serializeValue(v,0)}`).join(',\n');
out += '\n}\n\nconst IMAGE_DB = {\n';
out += Object.entries(IMAGE_DB).map(([k,v]) => `${JSON.stringify(k)}: ${serializeValue(v,0)}`).join(',\n');
out += '\n}\n\nconst QUESTIONS = [\n';
out += QUESTIONS.map(q => serializeValue(q,0)).join(',\n');
out += '\n]\n';

writeFileSync('questions.js', out, 'utf-8');
console.log(`✓ ${action} ${question.id} appliqué — questions.js mis à jour`);
