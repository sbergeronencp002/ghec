// ─────────────────────────────────────────────────────────────────────
// Sérialiseur partagé de questions.js — source UNIQUE.
//
// Chargé par admin.html ET documents.html : les deux pages réécrivent
// questions.js sur GitHub et DOIVENT produire exactement le même format
// (sinon, divergences de diff / conflits de données). Auparavant ce code
// était dupliqué dans chaque page ; il vit désormais ici uniquement.
//
// Expose en global : serializeValue, ensureImageDbComplete, generateQuestionsJs.
// ─────────────────────────────────────────────────────────────────────

function _isScalar(v) {
  return v === null || v === undefined || v === false || v === true || typeof v === 'number' || typeof v === 'string';
}

// Objet plat = toutes les valeurs sont scalaires (pas d'imbrication)
function _isFlat(v) {
  if(_isScalar(v)) return true;
  if(Array.isArray(v) || typeof v !== 'object' || v === null) return false;
  return Object.values(v).every(_isScalar);
}

// Sérialise récursivement une valeur JS en code source compact (sans indentation).
// Les objets et tableaux dont la représentation tient en ≤ 500 chars sont mis sur
// une seule ligne ; sinon ils sont éclatés avec une indentation minimale (1 espace).
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
  // Objet
  const entries = Object.entries(v);
  if(!entries.length) return '{}';
  const fmtKey = k => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
  const pairs = entries.map(([k,val]) => fmtKey(k) + ': ' + serializeValue(val, indent+1));
  const oneLine = '{' + pairs.join(', ') + '}';
  if(oneLine.length <= 500) return oneLine;
  return '{\n' + pairs.map(p => pad1 + p).join(',\n') + '\n' + pad + '}';
}

// Garantit que toute image référencée par une question possède une entrée IMAGE_DB.
function ensureImageDbComplete(questions, imageDb) {
  questions.forEach(q => {
    q.documents?.forEach(d => d.cols?.forEach(c => {
      if(c.ref && !imageDb[c.ref]) imageDb[c.ref] = { src: 'images/' + c.ref };
    }));
    if(q.reponse?.ref && !imageDb[q.reponse.ref]) imageDb[q.reponse.ref] = { src: 'images/' + q.reponse.ref };
  });
}

// Génère questions-index.js : version allégée de QUESTIONS (champs grille seulement).
// Utilisé par index.html pour le chargement initial rapide (~200 Ko vs ~900 Ko).
const _INDEX_FIELDS = ['id','niveau','oi','competence','periode','points','soustag','aspects','enonce','updatedAt'];
function generateIndexJs(questions) {
  const slim = questions.map(q => {
    const s = {};
    _INDEX_FIELDS.forEach(k => { if(q[k] !== undefined) s[k] = q[k]; });
    return s;
  });
  return 'const QUESTIONS = [\n' + slim.map(q => serializeValue(q,0)).join(',\n') + '\n]\n';
}

// Reconstruit le fichier questions.js complet (REGLETTES + IMAGE_DB + QUESTIONS).
function generateQuestionsJs(questions, reglettes, imageDb) {
  ensureImageDbComplete(questions, imageDb);
  let out = 'const REGLETTES = {\n';
  out += Object.entries(reglettes).map(([k,v]) => `${JSON.stringify(k)}: ${serializeValue(v,0)}`).join(',\n');
  out += '\n}\n\nconst IMAGE_DB = {\n';
  out += Object.entries(imageDb).map(([k,v]) => `${JSON.stringify(k)}: ${serializeValue(v,0)}`).join(',\n');
  out += '\n}\n\nconst QUESTIONS = [\n';
  out += questions.map(q => serializeValue(q,0)).join(',\n');
  out += '\n]\n';
  return out;
}
