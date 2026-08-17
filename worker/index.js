// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Worker — ghec-admin
//
// Reçoit une mutation (ajout / modification / suppression de question) depuis
// admin.html, l'applique sur questions.js via l'API GitHub, et renvoie le
// nouveau SHA + le prochain ID libre.
//
// Avantage : le client n'envoie que ~2 Ko (la mutation) au lieu de ~1,25 Mo
// (questions.js complet en base64). Le Worker lit et écrit GitHub en
// server-to-server (rapide) — publication en ~1-2 s au lieu de 30-35 s.
//
// Secrets Cloudflare (wrangler secret put) :
//   GITHUB_PAT    — Personal Access Token GitHub (scope repo)
//   WORKER_SECRET — Clé partagée avec admin.html pour authentifier les appels
// ─────────────────────────────────────────────────────────────────────────────

const OWNER  = 'sbergeronencp002';
const REPO   = 'ghec';
const BRANCH = 'main';
const QUESTIONS_PATH = 'questions.js';
const BACKUPS_PATH   = 'backups';
const BACKUPS_KEEP   = 20;

// ── Sérialiseur (copie EXACTE de questions-io.js — ne pas modifier sans répercuter
//    le changement dans questions-io.js ET tools/apply-mutation.mjs. Les trois copies
//    avaient divergé — seuil one-line, indentation et présence du test _isFlat — ce qui
//    provoquait un reformatage complet de questions.js à chaque alternance de voie de
//    publication (Worker vs admin.html/documents.html). Resynchronisé le 2026-07-09.) ──

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
// Profondeur d'imbrication max raisonnable pour une question (documents→cols→champs
// scalaires ≈ 4-5 niveaux) — au-delà, on refuse plutôt que de risquer un dépassement de
// pile sur une structure pathologique. Particulièrement important ici : ce Worker est
// exposé publiquement (protégé seulement par WORKER_SECRET) — ces trois copies
// (questions-io.js, tools/apply-mutation.mjs) doivent rester identiques.
const _SERIALIZE_MAX_DEPTH = 30;
function serializeValue(v, indent=0) {
  if(indent > _SERIALIZE_MAX_DEPTH) throw new Error('Structure trop profondément imbriquée (max ' + _SERIALIZE_MAX_DEPTH + ' niveaux)');
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
// Copie EXACTE de generateIndexJs (questions-io.js) — voir la note plus haut sur les
// copies du sérialiseur qui doivent rester identiques.
const _INDEX_FIELDS = ['id','niveau','oi','competence','periodes','points','soustag','aspects','enonce','updatedAt'];
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function utf8b64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function b64utf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function errResp(msg, status = 400) {
  return jsonResp({ ok: false, error: msg }, status);
}

// Comparaison à temps constant : le secret est statique (pas de rotation automatique,
// voir CLAUDE.md) et cet endpoint est public (CORS *) — une comparaison `===` naïve
// laisse fuir la longueur du préfixe correct via le temps de réponse.
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Validation minimale du payload — cet endpoint écrit directement sur `main` sans revue
// humaine ; un payload malformé (id non conforme, champs manquants/de mauvais type)
// pourrait sinon corrompre questions.js ou casser le rendu public pour tous les élèves.
function validateQuestionPayload(q) {
  if (typeof q !== 'object' || q === null) return 'question invalide';
  if (typeof q.id !== 'string' || !/^Q\d+$/.test(q.id)) return 'question.id invalide (attendu "Q" suivi de chiffres)';
  if (typeof q.oi !== 'string' || !q.oi) return 'question.oi manquant';
  if (typeof q.niveau !== 'number' || !Number.isInteger(q.niveau) || q.niveau < 1) return 'question.niveau invalide (entier positif attendu)';
  if (!Array.isArray(q.periodes) || !q.periodes.length || q.periodes.some(p => typeof p !== 'string' || !p)) return 'question.periodes manquant (tableau de 1 ou 2 sociétés)';
  if (typeof q.enonce !== 'string') return 'question.enonce manquant';
  if (q.documents !== undefined && !Array.isArray(q.documents)) return 'question.documents doit être un tableau';
  if (q.aspects !== undefined && !Array.isArray(q.aspects)) return 'question.aspects doit être un tableau';
  return null;
}

// Plafond de taille du payload — cet endpoint est public (protégé seulement par
// WORKER_SECRET, voir CLAUDE.md) ; sans plafond, quiconque connaît/devine le secret
// pourrait committer un payload de plusieurs Mo sur `main` et casser le site public pour
// tous les élèves. Une question réelle (énoncé + documents texte + réglette) ne dépasse
// jamais quelques Ko — 100 Ko laisse une marge très large.
const MAX_BODY_BYTES = 100_000;
// reglette n'était auparavant pas validé du tout : n'importe quelle forme (chaîne, tableau,
// nombre) était acceptée et écrite telle quelle dans REGLETTES.
function validateReglette(r) {
  if (r === undefined) return null;
  if (typeof r !== 'object' || r === null || Array.isArray(r)) return 'reglette doit être un objet';
  return null;
}

// Plafond du payload image — même logique que MAX_BODY_BYTES pour les questions : l'API
// Contents de GitHub refuse au-delà d'~1 Mo réel (~1,4 Mo encodé en base64). admin.html
// redimensionne déjà côté client pour rester sous ce seuil, mais on revalide ici puisque cet
// endpoint est public (protégé seulement par WORKER_SECRET).
const MAX_IMAGE_B64_BYTES = 1_400_000;

function validateImageName(name) {
  if (typeof name !== 'string' || name.includes('..') || name.includes('/')) return 'nom de fichier invalide';
  if (!/^[a-zA-Z0-9_.-]+\.(png|jpe?g|webp|gif)$/i.test(name)) return 'nom de fichier invalide (extension attendue : png/jpg/jpeg/webp/gif)';
  return null;
}

// ── Fetch questions.js depuis GitHub ─────────────────────────────────────────

async function fetchQuestionsRaw(token) {
  const resp = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${QUESTIONS_PATH}`,
    { headers: { Authorization: `token ${token}`, 'User-Agent': 'ghec-worker' }, cache: 'no-store' }
  );
  if (!resp.ok) throw new Error('GitHub fetch ' + resp.status);
  const data = await resp.json();
  const sha = data.sha;
  let content;
  if (data.content) {
    content = b64utf8(data.content);
  } else if (data.download_url) {
    const raw = await fetch(data.download_url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!raw.ok) throw new Error('GitHub download ' + raw.status);
    content = await raw.text();
  } else {
    throw new Error('Réponse inattendue de GitHub');
  }
  return { sha, content };
}

// ── Backup + élagage (fire-and-forget via ctx.waitUntil) ─────────────────────

async function doBackupAndPrune(token, content) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  const backupName = `questions-${ts}.js`;

  // Écrire le backup
  await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${BACKUPS_PATH}/${backupName}`,
    {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ghec-worker' },
      body: JSON.stringify({ message: `Backup auto ${ts}`, content: utf8b64(content), branch: BRANCH }),
    }
  ).catch(() => {});

  // Élaguer les anciens backups
  try {
    const listResp = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${BACKUPS_PATH}?ref=${BRANCH}&t=${Date.now()}`,
      { headers: { Authorization: `token ${token}`, 'User-Agent': 'ghec-worker' }, cache: 'no-store' }
    );
    if (!listResp.ok) return;
    const files = await listResp.json();
    const backups = files
      .filter(f => f.name.startsWith('questions-') && f.name.endsWith('.js'))
      .sort((a, b) => b.name.localeCompare(a.name));
    const toDelete = backups.slice(BACKUPS_KEEP);
    for (const f of toDelete) {
      await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${BACKUPS_PATH}/${encodeURIComponent(f.name)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ghec-worker' },
          body: JSON.stringify({ message: `Élaguer backup ${f.name}`, sha: f.sha, branch: BRANCH }),
        }
      ).catch(() => {});
    }
  } catch (_) {}
}

// ── Republier questions-index.js (fire-and-forget via ctx.waitUntil) ─────────
// Le Worker écrit questions.js server-to-server sans jamais passer par le token GitHub
// personnel du client (getToken() dans admin.html) — publishIndex() côté admin.html, qui
// dépend de ce token, ne se déclenche donc QUE s'il est configuré. Un enseignant qui n'a
// configuré que la voie Worker (workerUrl/workerSecret, sans PAT personnel) ne l'aura
// jamais : questions-index.js resterait périmé indéfiniment après chaque publication
// Worker. En le publiant nous-mêmes ici avec GITHUB_PAT (déjà en main côté serveur), la
// voie Worker n'a plus besoin d'un token client pour rester cohérente.
async function doPublishIndex(token, questions, commitMsg) {
  try {
    let sha;
    const r1 = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/questions-index.js?ref=${BRANCH}&t=${Date.now()}`,
      { headers: { Authorization: `token ${token}`, 'User-Agent': 'ghec-worker' }, cache: 'no-store' }
    );
    if (r1.ok) { const d1 = await r1.json(); sha = d1.sha; }
    const body = { message: commitMsg + ' [index]', content: utf8b64(generateIndexJs(questions)), branch: BRANCH };
    if (sha) body.sha = sha;
    await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/questions-index.js`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ghec-worker' },
      body: JSON.stringify(body),
    });
  } catch (_) {}
}

// ── Handler principal ─────────────────────────────────────────────────────────

async function handlePublish(request, env, ctx) {
  let body, rawText;
  try { rawText = await request.text(); body = JSON.parse(rawText); } catch { return errResp('JSON invalide'); }

  const { secret, action, question, reglette, editingId } = body;

  if (!secret || !timingSafeEqual(secret, env.WORKER_SECRET)) return errResp('Non autorisé', 401);
  // Plafond APRÈS l'authentification : un appelant non authentifié n'a aucune raison de
  // savoir que la taille du payload est même examinée.
  if (rawText.length > MAX_BODY_BYTES) {
    return errResp(`Payload trop volumineux (${rawText.length} > ${MAX_BODY_BYTES} octets)`, 413);
  }
  if (!action || !['upsert', 'delete'].includes(action)) return errResp('action invalide');
  if (typeof question?.id !== 'string' || !/^Q\d+$/.test(question.id)) {
    return errResp('question.id invalide (attendu "Q" suivi de chiffres)');
  }
  // Le client verrouille #q-id dès que editingId est posé (admin.html/setEditingId) — les
  // deux ne devraient donc jamais diverger. Un écart signale un client obsolète (bug déjà vu :
  // remplace silencieusement la question à editingId par le contenu d'une autre) — refuser.
  if (action === 'upsert' && editingId && editingId !== question.id) {
    return errResp(`editingId (${editingId}) ne correspond pas à question.id (${question.id}) — publication refusée`, 409);
  }
  if (action === 'upsert') {
    const payloadErr = validateQuestionPayload(question);
    if (payloadErr) return errResp(payloadErr);
    const regletteErr = validateReglette(reglette);
    if (regletteErr) return errResp(regletteErr);
  }

  const token = env.GITHUB_PAT;

  // 1. Récupérer l'état actuel
  let sha, content, QUESTIONS, REGLETTES, IMAGE_DB;
  try {
    ({ sha, content } = await fetchQuestionsRaw(token));
    const fn = new Function(content + '\nreturn { QUESTIONS, REGLETTES, IMAGE_DB };');
    ({ QUESTIONS, REGLETTES, IMAGE_DB } = fn());
  } catch (e) {
    return errResp('Lecture GitHub échouée : ' + e.message, 502);
  }

  // 2. Backup fire-and-forget (contenu avant mutation)
  ctx.waitUntil(doBackupAndPrune(token, content));

  // 3. Appliquer la mutation
  if (action === 'delete') {
    const idx = QUESTIONS.findIndex(q => q.id === question.id);
    if (idx !== -1) QUESTIONS.splice(idx, 1);
    delete REGLETTES[question.id];
  } else {
    // upsert
    if (editingId) {
      const idx = QUESTIONS.findIndex(q => q.id === editingId);
      if (idx !== -1) QUESTIONS[idx] = question; else QUESTIONS.push(question);
      if (editingId !== question.id) delete REGLETTES[editingId];
    } else {
      if (QUESTIONS.find(q => q.id === question.id)) {
        return errResp(`L'identifiant ${question.id} existe déjà`, 409);
      }
      QUESTIONS.push(question);
    }
    REGLETTES[question.id] = reglette || {};
  }

  // 4. Régénérer questions.js
  const newContent = generateQuestionsJs(QUESTIONS, REGLETTES, IMAGE_DB);
  const commitMsg = action === 'delete'
    ? `Supprimer ${question.id}`
    : (editingId ? `Modifier ${question.id} — ${question.oi}` : `Ajouter ${question.id} — ${question.oi} (${(question.periodes||[]).join(' + ')})`);

  // 5. PUT vers GitHub (jusqu'à 2 tentatives sur conflit SHA)
  let newSha;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      // Le SHA a changé depuis qu'on a lu : on relit et on réapplique
      try {
        let freshContent;
        ({ sha, content: freshContent } = await fetchQuestionsRaw(token));
        const fn2 = new Function(freshContent + '\nreturn { QUESTIONS, REGLETTES, IMAGE_DB };');
        const fresh = fn2();
        // Réappliquer la même mutation sur l'état frais
        if (action === 'delete') {
          const idx = fresh.QUESTIONS.findIndex(q => q.id === question.id);
          if (idx !== -1) fresh.QUESTIONS.splice(idx, 1);
          delete fresh.REGLETTES[question.id];
          QUESTIONS = fresh.QUESTIONS; REGLETTES = fresh.REGLETTES; IMAGE_DB = fresh.IMAGE_DB;
        } else {
          if (editingId) {
            const idx = fresh.QUESTIONS.findIndex(q => q.id === editingId);
            if (idx !== -1) fresh.QUESTIONS[idx] = question; else fresh.QUESTIONS.push(question);
            if (editingId !== question.id) delete fresh.REGLETTES[editingId];
          } else if (!fresh.QUESTIONS.find(q => q.id === question.id)) {
            fresh.QUESTIONS.push(question);
          } else {
            // L'ID a été pris par quelqu'un d'autre entre la lecture initiale et cette
            // relecture après conflit 409 — ne JAMAIS abandonner silencieusement l'ajout
            // (avant ce correctif : la mutation était ignorée mais la réponse restait
            // ok:true, donnant l'illusion côté client que la question avait été publiée —
            // cause probable des pertes silencieuses Q712/Q738/Q745/Q767/Q772/Q779).
            return errResp(`L'identifiant ${question.id} a été ajouté par un autre utilisateur entre-temps. Rechargez (F5).`, 409);
          }
          fresh.REGLETTES[question.id] = reglette || {};
          QUESTIONS = fresh.QUESTIONS; REGLETTES = fresh.REGLETTES; IMAGE_DB = fresh.IMAGE_DB;
        }
      } catch (e) {
        return errResp('Rechargement GitHub échoué : ' + e.message, 502);
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    const putResp = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${QUESTIONS_PATH}`,
      {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ghec-worker' },
        body: JSON.stringify({ message: commitMsg, content: utf8b64(generateQuestionsJs(QUESTIONS, REGLETTES, IMAGE_DB)), sha, branch: BRANCH }),
      }
    );

    if (putResp.ok) {
      const putData = await putResp.json();
      newSha = putData.content.sha;
      ctx.waitUntil(doPublishIndex(token, QUESTIONS, commitMsg));
      break;
    }

    const errData = await putResp.json().catch(() => ({}));
    const errMsg  = errData.message || String(putResp.status);
    const isConflict = putResp.status === 409 || errMsg.toLowerCase().includes('fast forward') || errMsg.toLowerCase().includes('conflict');
    if (!isConflict || attempt === 1) {
      return errResp(isConflict ? 'Conflit persistant. Rechargez la page (F5) et réessayez.' : errMsg, putResp.status);
    }
  }

  // L'écriture GitHub a déjà réussi à ce stade : une erreur ici ne doit pas transformer
  // un succès en réponse d'échec (le client réessaierait et dupliquerait la mutation).
  let nextId = null;
  try {
    const nums = QUESTIONS.map(q => parseInt(String(q.id).replace(/\D/g, ''))).filter(n => !isNaN(n));
    nextId = 'Q' + (nums.length ? Math.max(...nums) + 1 : 1);
  } catch (_) {}

  return jsonResp({ ok: true, sha: newSha, nextId });
}

// ── Téléversement d'image ─────────────────────────────────────────────────────
// Contrairement à handlePublish (questions.js, ~2 Ko), une image tient rarement en une
// seule requête sous le blocage réseau observé chez un enseignant (écritures PUT vers
// api.github.com bloquées par un filtre réseau d'école) — server-to-server via le Worker
// contourne ce blocage exactement comme pour la publication de questions.
async function handleUploadImage(request, env, ctx) {
  let body, rawText;
  try { rawText = await request.text(); body = JSON.parse(rawText); } catch { return errResp('JSON invalide'); }

  const { secret, name, contentB64 } = body;

  if (!secret || !timingSafeEqual(secret, env.WORKER_SECRET)) return errResp('Non autorisé', 401);
  if (rawText.length > MAX_IMAGE_B64_BYTES + 1000) {
    return errResp(`Image trop volumineuse (${rawText.length} > ~${MAX_IMAGE_B64_BYTES} octets encodés)`, 413);
  }
  const nameErr = validateImageName(name);
  if (nameErr) return errResp(nameErr);
  if (typeof contentB64 !== 'string' || !contentB64) return errResp('contenu image manquant');

  const token = env.GITHUB_PAT;
  const path = `images/${name}`;

  // SHA existant (pour écraser proprement) — absence de fichier n'est pas une erreur.
  let existingSha;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}&t=${Date.now()}`,
      { headers: { Authorization: `token ${token}`, 'User-Agent': 'ghec-worker' }, cache: 'no-store' }
    );
    if (r.ok) { const d = await r.json(); existingSha = d.sha; }
  } catch (_) {}

  const putResp = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ghec-worker' },
    body: JSON.stringify({
      message: `Ajouter image : ${name}`,
      content: contentB64,
      branch: BRANCH,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  if (!putResp.ok) {
    const errData = await putResp.json().catch(() => ({}));
    return errResp(errData.message || String(putResp.status), putResp.status);
  }
  const putData = await putResp.json();
  return jsonResp({ ok: true, sha: putData.content.sha, name, overwritten: !!existingSha });
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/publish' && request.method === 'POST') {
      // Toute exception non prévue (ex. serializeValue qui refuse une structure trop
      // profonde, ou tout autre bug) doit renvoyer une réponse AVEC les en-têtes CORS —
      // sinon le client voit une erreur CORS/réseau opaque plutôt que le vrai message, et
      // admin.html interprète ça comme « Worker indisponible » et bascule silencieusement
      // sur le fallback GitHub Actions, masquant le bug réel pendant le débogage.
      try {
        return await handlePublish(request, env, ctx);
      } catch (e) {
        return errResp('Erreur interne : ' + e.message, 500);
      }
    }

    if (url.pathname === '/upload-image' && request.method === 'POST') {
      try {
        return await handleUploadImage(request, env, ctx);
      } catch (e) {
        return errResp('Erreur interne : ' + e.message, 500);
      }
    }

    return new Response('GHEC CSSBF Worker — OK', { status: 200 });
  },
};
