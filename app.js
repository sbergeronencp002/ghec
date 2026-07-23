
function escLine(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
// Échappe pour un attribut HTML entre guillemets doubles (ex. alt, aria-label).
function escAttr(s) {
  return escLine(String(s)).replace(/"/g,'&quot;');
}
// Échappe pour une chaîne JS entre apostrophes (ex. dans un onclick="…('…')").
function jsStr(s) {
  return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}
function boldify(s) {
  return s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}
function formatTexte(text) {
  let html = '', inList = false;
  text.split('\n').forEach(line => {
    if(line.startsWith('• ')) {   // puce canonique uniquement (bouton « • Puce »)
      if(!inList) { html += '<ul style="margin:2px 0 2px 14px;padding:0">'; inList = true; }
      html += '<li>' + boldify(escLine(line.slice(2))) + '</li>';
    } else {
      if(inList) { html += '</ul>'; inList = false; }
      if(line.trim()) html += boldify(escLine(line)) + '<br>';
      else html += '<br>';
    }
  });
  if(inList) html += '</ul>';
  return html;
}

// Normalise pour la recherche : minuscules + suppression des accents (é → e)
function fold(s) {
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Fusionne les documents \u00ab textes \u00bb \u00e0 une seule colonne en un tableau \u00e0 2 colonnes :
//   - 2 documents (A,B)     \u2192 1 rang\u00e9e de 2 colonnes
//   - 4 documents (A,B,C,D) \u2192 2 rang\u00e9es de 2 colonnes
// Le document fusionn\u00e9 porte `colsPerRow` (2) ; les rendus d\u00e9coupent `cols` en
// rang\u00e9es de cette taille. Sinon retourne les documents tels quels. Utilis\u00e9 par
// le modal, la pr\u00e9visualisation et le DOCX pour un rendu coh\u00e9rent.
function docsForRender(documents) {
  const docs = documents || [];
  const allSingleTextes = docs.every(d => d && d.type === 'textes' && (d.cols||[]).length === 1);
  if((docs.length === 2 || docs.length === 4) && allSingleTextes) {
    return [{ type: 'textes', cols: docs.map(d => d.cols[0]), colsPerRow: 2 }];
  }
  return docs;
}

// Styles des OI : dérivés de la source unique OI_CONFIG (oi-config.js, chargé avant app.js).
// Repli défensif si oi-config.js n'a pas pu être chargé.
const OI_STYLES = (typeof OI_CONFIG !== 'undefined') ? OI_CONFIG : {};

function oiStyle(oi) {
  return OI_STYLES[oi] || {color:"var(--ink-2)", bg:"var(--paper-3)"};
}

let aspects = [];
const periodeOrder = (typeof PERIODES_PAR_NIVEAU !== 'undefined')
  ? Object.values(PERIODES_PAR_NIVEAU).flat()
  : [];
let Q_MAP = new Map();          // id → question (O(1) lookup)
let Q_SEARCH_IDX = new Map();   // id → lowercase search string (pre-built)
let NEW_IDS = new Set();        // 10 questions les plus récentes
let panier = [];                // ids du panier (déclaré ici : utilisé dès initSite via render → buildTileHtml)
let _imgDocxCache = {};         // cache data-URL des images résolues pour DOCX (ne pas muter IMAGE_DB)

// Champs complets (documents, réponse, guide, réglettes, IMAGE_DB) chargés en lazy
// au premier openQModal / prévisualiser / genererDocx. REGLETTES et IMAGE_DB sont
// initialisés vides ici car questions.js n'est plus chargé comme <script>.
let REGLETTES = {};
let IMAGE_DB = {};
let _dataLoaded = false;
let _dataLoadPromise = null;

async function ensureDataLoaded() {
  if (_dataLoaded) return;
  if (_dataLoadPromise) return _dataLoadPromise;
  _dataLoadPromise = (async () => {
    // API GitHub en priorité : le site statique (GitHub Pages) est servi derrière un CDN
    // qui peut continuer à servir une ancienne version de questions.js après une
    // publication, même avec le cache-bust par timestamp sur l'URL (le CDN peut ignorer
    // la query string pour la clé de cache) — l'API GitHub, elle, reflète toujours l'état
    // réel du dépôt. Ne se fait qu'une fois par chargement de page (voir _dataLoaded), donc
    // le quota anonyme de l'API (60 req/h) n'est pas un risque pour le site public ; en cas
    // d'échec (hors ligne, quota dépassé), repli silencieux sur le site statique.
    let src;
    try {
      const r = await fetch('https://api.github.com/repos/sbergeronencp002/ghec/contents/questions.js?ref=main&t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      if (d.content) {
        const rawBytes = Uint8Array.from(atob(d.content.replace(/\n/g,'')), c => c.charCodeAt(0));
        src = new TextDecoder('utf-8').decode(rawBytes);
      } else if (d.download_url) {
        const dlUrl = d.download_url + (d.download_url.includes('?') ? '&' : '?') + 't=' + Date.now();
        const raw = await fetch(dlUrl, { cache: 'no-store' });
        if (!raw.ok) throw new Error('download_url ' + raw.status);
        src = await raw.text();
      } else {
        throw new Error("Réponse API inattendue");
      }
    } catch (e) {
      const r2 = await fetch('questions.js?t=' + Date.now(), { cache: 'no-store' });
      if (!r2.ok) throw new Error('Impossible de charger les données complètes (' + r2.status + ')');
      src = await r2.text();
    }
    const result = new Function(src + '\nreturn{REGLETTES,IMAGE_DB,QUESTIONS}')();
    REGLETTES = result.REGLETTES;
    IMAGE_DB  = result.IMAGE_DB;
    // Enrichir les objets slim déjà dans Q_MAP avec les champs complets
    for (const q of result.QUESTIONS) {
      const slim = Q_MAP.get(q.id);
      if (slim) Object.assign(slim, q);
      else Q_MAP.set(q.id, q);
    }
    _dataLoaded = true;
  })();
  return _dataLoadPromise;
}

function populateFilters() {
  Q_MAP = new Map(QUESTIONS.map(q => [q.id, q]));
  Q_SEARCH_IDX = new Map(QUESTIONS.map(q => [q.id,
    fold([q.enonce||'', q.oi||'', q.periode||'', ...(q.aspects||[]).map(a=>a.aspect)].join(' '))
  ]));
  const sorted = [...QUESTIONS].sort((a,b) => {
    const ta = a.updatedAt || '';
    const tb = b.updatedAt || '';
    if(tb !== ta) return tb < ta ? -1 : 1;
    return (parseInt(b.id.replace(/\D/g,''))||0) - (parseInt(a.id.replace(/\D/g,''))||0);
  });
  NEW_IDS = new Set(sorted.slice(0,10).map(q=>q.id));
  const allOis = [...new Set(QUESTIONS.map(q=>q.oi))].sort((a,b)=>a.localeCompare(b,'fr'));
  const aspectsByPeriode = {};
  QUESTIONS.forEach(q=>{
    (q.aspects||[]).forEach(a=>{
      if(!aspectsByPeriode[q.periode]) aspectsByPeriode[q.periode]=new Set();
      aspectsByPeriode[q.periode].add(a.aspect);
    });
  });
  aspects = periodeOrder.flatMap(p=>{
    if(!aspectsByPeriode[p]) return [];
    return [...aspectsByPeriode[p]].sort((a,b)=>a.localeCompare(b,'fr')).map(a=>({aspect:a, periode:p}));
  });
  const periodesPresentes = new Set(QUESTIONS.map(q=>q.periode));
  const periodes = periodeOrder.filter(p => periodesPresentes.has(p));

  fillSelect('f-niveau', Object.keys(PERIODES_PAR_NIVEAU).sort(), "Tous");
  fillSelect('f-periode', periodes, "Toutes");
  fillAspectSelect('f-aspect', aspects, periodeOrder);
  fillSelect('f-oi', allOis, "Toutes");
}

// Ids des <select> de la cascade niveau→période→aspect (voir filters.js, chargé avant app.js).
const FILTER_IDS = { niveau: 'f-niveau', periode: 'f-periode', aspect: 'f-aspect' };

function onPeriodeChange() {
  cascadePeriodeChange(FILTER_IDS, aspects, periodeOrder, PERIODES_PAR_NIVEAU);
  applyFilters();
}

function onNiveauChange() {
  cascadeNiveauChange(FILTER_IDS, aspects, periodeOrder, PERIODES_PAR_NIVEAU);
  applyFilters();
}

// Debounce uniquement pour la frappe de recherche
let _searchTimer = 0;
function debouncedApplyFilters() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(applyFilters, 280);
}

function applyFilters() {
  const oi      = document.getElementById('f-oi').value;
  const aspect  = document.getElementById('f-aspect').value;
  const periode = document.getElementById('f-periode').value;
  const niveau  = document.getElementById('f-niveau').value;
  const search  = fold((document.getElementById('f-search')?.value || '').trim());
  const currentOi = oi;

  // Parcours unique : construit filtered + relevantOis en même passe
  const filtered = [];
  const oiSet = new Set();
  for(const q of QUESTIONS) {
    const niveauOk  = !niveau  || String(q.niveau) === niveau;
    const periodeOk = !periode || q.periode === periode;
    const aspectOk  = !aspect  || (q.aspects||[]).some(a=>a.aspect===aspect);
    if(niveauOk && periodeOk && aspectOk) oiSet.add(q.oi);
    if(!niveauOk || !periodeOk || !aspectOk) continue;
    if(oi && q.oi !== oi) continue;
    if(search && !(Q_SEARCH_IDX.get(q.id)||'').includes(search)) continue;
    filtered.push(q);
  }

  filtered.sort((a, b) => {
    const ta = a.updatedAt || '';
    const tb = b.updatedAt || '';
    if(tb !== ta) return tb < ta ? -1 : 1;
    const nA = parseInt(a.id.replace(/\D/g, '')) || 0;
    const nB = parseInt(b.id.replace(/\D/g, '')) || 0;
    return nB - nA;
  });

  const relevantOis = [...oiSet].sort((a,b)=>a.localeCompare(b,'fr'));
  fillSelect('f-oi', relevantOis, "Toutes");
  if(relevantOis.includes(currentOi)) document.getElementById('f-oi').value = currentOi;

  const totalPtsFilt = filtered.reduce((s,q)=>s+(q.points||0), 0);
  document.getElementById('stat-num').textContent = filtered.length;
  const statPts = document.getElementById('stat-pts');
  if(statPts) statPts.textContent = totalPtsFilt + ' pt' + (totalPtsFilt!==1?'s':'') + ' disponibles';
  document.getElementById('results-label').textContent =
    filtered.length === QUESTIONS.length
      ? `Toutes les questions (${filtered.length})`
      : `${filtered.length} question${filtered.length!==1?'s':''} · ${totalPtsFilt} pt${totalPtsFilt!==1?'s':''}`;

  render(filtered);
}

function resetFilters() {
  ['f-niveau','f-periode','f-aspect','f-oi','f-search'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  onNiveauChange();
}

function buildReglettHTML(q) {
  const r = REGLETTES[q.id];
  if(!r) return '<p><em>Réglette non disponible.</em></p>';

  const S = 'font-family:Aptos,Arial,sans-serif;font-size:6pt;text-align:center;vertical-align:middle;border:1px solid #000;padding:4px 6px;background:#fff';
  const SB = S + ';font-weight:bold';

  // Matrix layout for causalité (3 éléments — 2 liens)
  if(r.variante === '3 éléments — 2 liens') {
    const S2 = S + ';border-right:none';
    const S3 = S + ';border-left:none;border-right:none';
    const S4 = S + ';border-left:none';
    return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
      <tr>
        <td style="${SB};width:22%" rowspan="6">${escLine(r.oi)}</td>
        <td style="${S2};width:26%" rowspan="3">L'élève précise les trois éléments</td>
        <td style="${S3};width:35%">et établit correctement deux liens de causalité.</td>
        <td style="${S4};width:17%">3 points</td>
      </tr>
      <tr>
        <td style="${S3}">et établit correctement un lien de causalité.</td>
        <td style="${S4}">2 points</td>
      </tr>
      <tr>
        <td style="${S3}">mais n'établit correctement aucun lien de causalité.</td>
        <td style="${S4}">1 point</td>
      </tr>
      <tr>
        <td style="${S2}" rowspan="2">L'élève précise deux éléments</td>
        <td style="${S3}">et établit correctement un lien de causalité.</td>
        <td style="${S4}">2 points</td>
      </tr>
      <tr>
        <td style="${S3}">mais n'établit correctement aucun lien de causalité.</td>
        <td style="${S4}">1 point</td>
      </tr>
      <tr>
        <td style="${S2}" colspan="2">L'élève précise un seul élément ou n'en précise pas.</td>
        <td style="${S4}">0 point</td>
      </tr>
    </table>`;
  }

  if(r.variante === 'acteur-positions') {
    const S2 = S + ';border-right:none';
    const S3 = S + ';border-left:none;border-right:none';
    const S4 = S + ';border-left:none';
    return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
      <tr>
        <td style="${SB};width:22%" rowspan="5">${escLine(r.oi)}</td>
        <td style="${S2};width:43%" rowspan="4">L'élève nomme correctement l'acteur qui présente une position différente</td>
        <td style="${S3}">et présente correctement les deux positions.</td>
        <td style="${S4};width:17%">3 points</td>
      </tr>
      <tr>
        <td style="${S3}">et présente correctement une position et plus ou moins correctement l'autre position.</td>
        <td style="${S4}">2 points</td>
      </tr>
      <tr>
        <td style="${S3}">et présente plus ou moins correctement les deux positions, ou présente correctement une position et incorrectement l'autre ou ne la présente pas.</td>
        <td style="${S4}">1 point</td>
      </tr>
      <tr>
        <td style="${S3}">et présente tout au plus une seule position plus ou moins correctement.</td>
        <td style="${S4}">0 point</td>
      </tr>
      <tr>
        <td style="${S2}" colspan="2">L'élève nomme incorrectement l'acteur qui présente une position différente ou ne le nomme pas.</td>
        <td style="${S4}">0 point</td>
      </tr>
    </table>`;
  }

  if(r.variante === 'changement-continuité') {
    const S2 = S + ';border-right:none';
    const S3 = S + ';border-left:none;border-right:none';
    const S4 = S + ';border-left:none';
    return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
      <tr>
        <td style="${SB};width:22%" rowspan="6">${escLine(r.oi)}</td>
        <td style="${S2};width:37%" rowspan="3">L'élève indique s'il y a changement ou continuité</td>
        <td style="${S3}">et présente des faits qui le montrent correctement.</td>
        <td style="${S4};width:20%">3 points (ou 2 points)</td>
      </tr>
      <tr>
        <td style="${S3}">et présente des faits qui le montrent plus ou moins correctement.</td>
        <td style="${S4}">2 points (ou 1 point)</td>
      </tr>
      <tr>
        <td style="${S3}">et présente des faits qui le montrent incorrectement ou n'en présente pas.</td>
        <td style="${S4}">0 point</td>
      </tr>
      <tr>
        <td style="${S2}" rowspan="3">L'élève n'indique pas s'il y a changement ou continuité</td>
        <td style="${S3}">mais présente des faits exacts.</td>
        <td style="${S4}">2 points (ou 1 point)</td>
      </tr>
      <tr>
        <td style="${S3}">mais présente des faits plus ou moins exacts.</td>
        <td style="${S4}">1 point (ou 0 point)</td>
      </tr>
      <tr>
        <td style="${S3}">et présente des faits inexacts ou n'en présente pas.</td>
        <td style="${S4}">0 point</td>
      </tr>
    </table>`;
  }

  // Standard layout — header row (points) + description row
  if(!r.colonnes || !r.colonnes.length) return '<p style="color:#999;font-size:0.8rem">Réglette non configurée.</p>';
  const colW = Math.floor(78 / r.colonnes.length);
  const headers = r.colonnes.map(c=>`<td style="${S};width:${colW}%">${escLine(c)}</td>`).join('');
  const cells   = (r.niveaux||[]).map(n=>`<td style="${S}">${escLine(n.desc)}</td>`).join('');

  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    <tr>
      <td style="${SB};width:22%" rowspan="2">${escLine(r.oi)}</td>
      ${headers}
    </tr>
    <tr>
      ${cells}
    </tr>
  </table>`;
}

let _qModalReqSeq = 0;
async function openQModal(id) {
  const reqId = ++_qModalReqSeq;
  _tzStore.length = 0;
  const q = Q_MAP.get(id);
  if(!q) return;
  const st = oiStyle(q.oi);

  // Ouvrir le modal tout de suite avec un spinner, puis remplir après chargement des données
  if(!_dataLoaded) {
    const modal = document.getElementById('q-modal');
    if(modal) {
      document.getElementById('q-modal-body').innerHTML =
        '<div style="text-align:center;padding:2rem;color:var(--ink-3)">Chargement…</div>';
      modal.classList.add('open');
      document.body.classList.add('modal-open');
    }
    try { await ensureDataLoaded(); } catch(e) {
      if(reqId !== _qModalReqSeq) return;
      document.getElementById('q-modal-body').innerHTML =
        '<div style="color:red;padding:1rem">Erreur de chargement : ' + e.message + '</div>';
      return;
    }
    // Un autre appel a été lancé entre-temps (double clic) — on abandonne ce rendu périmé
    if(reqId !== _qModalReqSeq) return;
  }

  const header = document.getElementById('q-modal-header');
  header.style.background = st.bg;
  header.style.color = st.color;
  header.style.borderBottom = '3px solid ' + st.color;

  const closeBtn = document.getElementById('q-modal-close');
  if(closeBtn) closeBtn.style.color = st.color;

  const qNum = document.getElementById('q-modal-num');
  if(qNum) { qNum.textContent = q.id; qNum.style.color = st.color; }

  const aspects = (q.aspects||[]).map(a => a.aspect).join(' · ');
  document.getElementById('q-modal-title').innerHTML =
    `<div class="q-oi-badge" style="color:${st.color};background:rgba(0,0,0,0.08)">${escLine(q.oi)}</div>` +
    `<div style="font-size:0.7rem;margin-top:3px;opacity:0.72">${escLine(aspects)}</div>` +
    `<div style="font-size:0.67rem;margin-top:2px;opacity:0.55;font-weight:600">${q.points}&thinsp;pt${q.points > 1 ? 's' : ''}</div>`;

  let html = '<div class="q-section-label">Question</div>';
  html += '<div class="q-full-enonce">' + formatTexte(q.enonce) + '</div>';

  const docsR = docsForRender(q.documents);
  if(docsR.length) {
    html += '<div class="q-section-label">Documents</div>';
    html += '<div class="q-docs-images">' + docsR.map(d => renderDoc(d)).join('<div class="doc-spacer"></div>') + '</div>';
  }

  const rep = renderReponse(q);
  if(rep) {
    html += '<div class="q-section-label">Espace réponse</div>' + rep;
  }

  const r = REGLETTES[q.id];
  if(r) {
    html += '<div class="q-section-label">Réglette</div>';
    if(r.variante) {
      html += '<div style="font-size:0.78rem;color:var(--ink-3);font-style:italic">Réglette complexe — disponible dans le cahier généré.</div>';
    } else {
      html += `<table class="reglette-table">${r.niveaux.map(n =>
        `<tr><td class="r-pts-cell">${n.pts}&thinsp;pt${n.pts > 1 ? 's' : ''}</td><td class="r-desc-cell">${escLine(n.desc)}</td></tr>`
      ).join('')}</table>`;
    }
  }

  const body = document.getElementById('q-modal-body');
  body.innerHTML = html;
  body.scrollTop = 0;

  const btn = document.getElementById('q-modal-panier-btn');
  btn.dataset.id = id;
  updateQModalBtn(id);

  document.getElementById('q-modal-overlay').classList.add('open');
}

function closeQModal() {
  document.getElementById('q-modal-overlay').classList.remove('open');
}

function closeQModalOverlay(e) {
  if(e.target === document.getElementById('q-modal-overlay')) closeQModal();
}

function copyQuestion() {
  const btn = document.getElementById('q-modal-panier-btn');
  const id = btn?.dataset.id;
  const q = id && Q_MAP.get(id);
  if(!q) return;
  const aspects = (q.aspects||[]).map(a=>a.aspect).join(', ');
  const periode = q.periode || '';
  const enonce = (q.enonce||'').replace(/\*\*(.*?)\*\*/g,'$1').replace(/^• /gm,'- ');
  const text = [q.oi, aspects && `Aspects : ${aspects}`, periode && `Société : ${periode}`, '', enonce]
    .filter(l=>l!==undefined).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const copyBtn = document.getElementById('q-modal-copy-btn');
    const orig = copyBtn.textContent;
    copyBtn.textContent = '✓ Copié';
    setTimeout(()=>{ copyBtn.textContent = orig; }, 2000);
  });
}

function updateTileState(id) {
  const tile = document.getElementById('tile-' + id);
  if(tile) tile.classList.toggle('in-panier', panier.includes(id));
}

function updateQModalBtn(id) {
  const btn = document.getElementById('q-modal-panier-btn');
  if(!btn || btn.dataset.id !== id) return;
  const inPanier = panier.includes(id);
  btn.textContent = inPanier ? '✓ Dans le panier' : '+ Ajouter au panier';
  btn.classList.toggle('in-panier', inPanier);
}

function togglePanierModal() {
  const btn = document.getElementById('q-modal-panier-btn');
  if(!btn || !btn.dataset.id) return;
  const id = btn.dataset.id;
  const wasInPanier = panier.includes(id);
  togglePanier(id);
  if(!wasInPanier && panier.includes(id)) closeQModal();
}

const PAGE_SIZE = 50;
let currentFiltered = [];

function buildTileHtml(q) {
  const st = oiStyle(q.oi);
  const aspect = (q.aspects||[]).map(a => a.aspect).join(' · ');
  const inPanier = panier.includes(q.id);
  const badge = s => `<span style="font-size:0.7rem;color:${st.color};background:${st.bg};border-radius:10px;padding:1px 8px;font-weight:500">${escLine(s)}</span>`;
  const badgeNew = `<span style="font-size:0.7rem;color:${st.color};background:${st.bg};border-radius:10px;padding:1px 8px;font-weight:700;letter-spacing:0.03em">Nouveauté</span>`;
  const tagsHtml = (NEW_IDS.has(q.id) || q.soustag)
    ? `<div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">${NEW_IDS.has(q.id) ? badgeNew : ''}${q.soustag ? badge(q.soustag) : ''}</div>`
    : '';
  return `<div class="q-tile${inPanier ? ' in-panier' : ''}" id="tile-${q.id}"
    role="button" tabindex="0" aria-label="${escAttr(q.oi + (aspect ? ' — ' + aspect : ''))}"
    style="--tile-color:${st.color};background:#fff" onclick="openQModal('${q.id}')"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openQModal('${q.id}')}">
    <div class="q-tile-bar" style="display:none"></div>
    <div class="q-tile-content">
      <div class="q-tile-oi" style="display:block;font-size:1.1rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:5px 12px;border-radius:6px;color:${st.color};background:${st.bg};line-height:1.3;word-break:break-word">${escLine(q.oi)}</div>
      <div class="q-tile-aspect" style="font-size:0.9rem;font-weight:400;color:#6B6560;margin-top:2px">${escLine(aspect)}</div>
      ${tagsHtml}
    </div>
    <span class="q-tile-check" role="button" tabindex="0" aria-label="Ajouter ou retirer du panier"
      onclick="event.stopPropagation();togglePanier('${q.id}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.stopPropagation();event.preventDefault();togglePanier('${q.id}')}">✓</span>
  </div>`;
}

function render(list) {
  currentFiltered = list;
  const container = document.getElementById('q-list');
  if(!list.length) {
    container.innerHTML = `<div class="empty-state"><span class="big">0</span>Aucune question ne correspond aux filtres.</div>`;
    return;
  }
  container.innerHTML = currentFiltered.slice(0, PAGE_SIZE).map(buildTileHtml).join('');
  const rem = currentFiltered.length - PAGE_SIZE;
  if(rem > 0) {
    container.insertAdjacentHTML('beforeend',
      `<div class="voir-plus-wrap"><button class="voir-plus-btn" onclick="renderMore()">Voir ${rem} autre${rem>1?'s':''} →</button></div>`);
  }
}

function renderMore() {
  const container = document.getElementById('q-list');
  container.querySelector('.voir-plus-wrap')?.remove();
  const shown = container.querySelectorAll('.q-tile').length;
  const next = currentFiltered.slice(shown, shown + PAGE_SIZE);
  container.insertAdjacentHTML('beforeend', next.map(buildTileHtml).join(''));
  const rem = currentFiltered.length - shown - next.length;
  if(rem > 0) {
    container.insertAdjacentHTML('beforeend',
      `<div class="voir-plus-wrap"><button class="voir-plus-btn" onclick="renderMore()">Voir ${rem} autre${rem>1?'s':''} →</button></div>`);
  }
}

function initSite() {
  // Les données sont déjà chargées par <script src="questions.js"> (globals
  // QUESTIONS / REGLETTES / IMAGE_DB). Un re-fetch via new Function() ne
  // fuiterait pas ses const en global : c'était du code mort qui doublait
  // le téléchargement. On s'appuie donc directement sur les globals.
  populateFilters();
  applyFilters();
  try {
    const saved = localStorage.getItem('hqc_panier');
    if(saved) {
      const ids = JSON.parse(saved).filter(id => QUESTIONS.some(q => q.id === id));
      if(ids.length) { panier = ids; updatePanierBar(); refreshPanierButtons(); }
    }
  } catch(e) {
    console.warn('Panier corrompu dans localStorage, réinitialisation.', e);
    localStorage.removeItem('hqc_panier');
  }
}
if(typeof QUESTIONS !== 'undefined') initSite();

window.addEventListener('storage', e => {
  if(e.key !== 'hqc_panier') return;
  try {
    panier = JSON.parse(e.newValue || '[]').filter(id => QUESTIONS.some(q => q.id === id));
    updatePanierBar();
    refreshPanierButtons();
  } catch(_) {
    console.warn('Panier: données cross-tab invalides, ignorées.');
  }
});

document.addEventListener('keydown', e => {
  const examOpen = document.getElementById('exam-overlay')?.style.display !== 'none';
  if(examOpen) {
    if(e.key === 'ArrowLeft')  { e.preventDefault(); examNav(-1); }
    if(e.key === 'ArrowRight') { e.preventDefault(); examNav(1); }
    if(e.key === 'Escape') {
      if(document.getElementById('text-zoom-overlay')?.classList.contains('open')) { closeTextZoomBtn(); }
      else { closeExam(); }
    }
    return;
  }
  if(e.key === 'Escape') { closeQModal(); closePreviewBtn(); closeTextZoomBtn(); }
});

// ===== PANIER =====
// (let panier = [] est déclaré en tête de fichier — voir plus haut)

function toggleTexte(btn) {
  const cell = btn.parentElement;
  const short = cell.querySelector('.doc-texte-short');
  const full = cell.querySelector('.doc-texte-full');
  if(full.style.display === 'none') {
    short.style.display = 'none';
    full.style.display = 'block';
    btn.textContent = 'Réduire';
  } else {
    short.style.display = 'block';
    full.style.display = 'none';
    btn.textContent = 'Lire la suite';
  }
}

function renderDoc(d, expanded = false) {
  // Textes avec troncature
  if(d.type === 'textes') {
    const cpr = d.colsPerRow || d.cols.length || 1;
    const colW = Math.floor(100/cpr);
    function renderCol(col) {
      let h = '<td style="width:' + colW + '%;padding:6px;vertical-align:top;border:0.5px solid var(--border)">';
      if(col.texte) {
        const zoomHtml = formatTexte(col.texte);
        const zoomIdx = _tzStore.push({titre: col.titre||'', html: zoomHtml}) - 1;
        const zoomBtn = '<button class="doc-zoom-btn" onclick="openTextZoom(' + zoomIdx + ')">🔍</button>';
        h += '<div style="font-size:0.75rem;font-weight:600;color:var(--ink)">' + escLine(col.titre||'') + zoomBtn + '</div>';
      } else {
        h += '<div style="font-size:0.75rem;font-weight:600;color:var(--ink)">' + escLine(col.titre||'') + '</div>';
      }
      if(col.soustitre) h += '<div style="font-size:0.7rem;font-style:italic;color:var(--ink-2);margin-bottom:4px">' + escLine(col.soustitre) + '</div>';
      else h += '<div style="margin-bottom:4px"></div>';
      if(col.texte) {
        const plain = col.texte.replace(/\*\*(.*?)\*\*/g,'$1');
        const isLong = !expanded && plain.length > 120;
        const shortHtml = isLong ? escLine(plain.substring(0,120)) + '…' : formatTexte(col.texte);
        h += '<div class="doc-texte-short" style="font-size:0.75rem;color:var(--ink-2);line-height:1.5">' + shortHtml + '</div>';
        if(isLong) {
          h += '<div class="doc-texte-full" style="display:none;font-size:0.75rem;color:var(--ink-2);line-height:1.5">' + formatTexte(col.texte) + '</div>';
          h += '<button onclick="toggleTexte(this)" style="font-size:0.7rem;color:var(--ink-3);background:none;border:none;cursor:pointer;padding:2px 0;text-decoration:underline">Lire la suite</button>';
        }
      } else if(col.ref) {
        const img2 = IMAGE_DB[col.ref];
        if(img2) h += '<div class="doc-img-tile" style="max-width:100%" onclick="' + escAttr("openLightbox('" + jsStr(img2.src) + "')") + '"><img src="' + escAttr(img2.src) + '" alt="' + escAttr(col.titre||col.ref||'Document') + '" style="max-width:100%;max-height:180px;object-fit:contain"></div>';
      }
      if(col.auteur) h += '<div style="font-size:0.7rem;color:var(--ink-2);margin-top:4px;font-style:italic">' + escLine(col.auteur) + '</div>';
      if(col.source) h += '<div style="font-size:0.65rem;color:var(--ink-3);margin-top:2px;font-style:italic">' + escLine(col.source) + '</div>';
      h += '</td>';
      return h;
    }
    let html = '<table style="width:100%;border-collapse:collapse;margin-bottom:8px">';
    for(let i=0; i<d.cols.length; i+=cpr) {
      html += '<tr>' + d.cols.slice(i, i+cpr).map(renderCol).join('') + '</tr>';
    }
    html += '</table>';
    return html;
  }
  // Tableau 2 colonnes → tuiles
  if(d.type === 'tableau') {
    let html = '<div class="doc-img-tiles">';
    d.cols.forEach(function(col) {
      const img = IMAGE_DB[col.ref];
      if(!img) return;
      html += '<div class="doc-img-tile" onclick="' + escAttr("openLightbox('" + jsStr(img.src) + "')") + '">';
      html += '<img src="' + escAttr(img.src) + '" alt="' + escAttr(col.titre||col.ref||'Document') + '">';
      if(col.titre) html += '<div class="doc-img-tile-label">' + escLine(col.titre) + '</div>';
      if(col.soustitre) html += '<div class="doc-img-tile-sub">' + escLine(col.soustitre) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }
  // Image simple
  const img = IMAGE_DB[d.ref];
  if(img) {
    let html = '<div class="doc-img-tiles"><div class="doc-img-tile" onclick="' + escAttr("openLightbox('" + jsStr(img.src) + "')") + '">';
    html += '<img src="' + escAttr(img.src) + '" alt="' + escAttr(d.titre||d.ref||'Document') + '" style="max-width:200px;max-height:200px;object-fit:contain">';
    if(d.titre) html += '<div class="doc-img-tile-label">' + escLine(d.titre) + '</div>';
    html += '</div></div>';
    return html;
  }
  return '<div><span class="doc-chip">' + escLine(d.type||'') + ' — ' + escLine(d.ref||'') + '</span></div>';
}

function renderReponse(q) {
  if(!q.reponse || q.reponse === false) return '';
  if(q.reponse === true) {
    return '<div style="border-bottom:1px solid var(--border);height:28px;margin:6px 0"></div>';
  }
  if(q.reponse.type === 'tableau_3col') {
    const {col1='', col2='', col3=''} = q.reponse;
    const S = 'border:1px solid var(--ink-2);text-align:center;font-weight:600;padding:6px 8px;font-size:0.8rem';
    return '<table style="border-collapse:collapse;margin:8px 0;">'
      + '<tr>'
      + '<td style="' + S + '">' + escLine(col1) + '</td>'
      + '<td style="' + S + ';vertical-align:middle" rowspan="2">' + escLine(col2) + '</td>'
      + '<td style="' + S + '">' + escLine(col3) + '</td>'
      + '</tr><tr>'
      + '<td style="border:1px solid var(--ink-2);background:var(--paper-2);height:50px;min-width:80px"></td>'
      + '<td style="border:1px solid var(--ink-2);background:var(--paper-2);height:50px;min-width:80px"></td>'
      + '</tr></table>';
  }
  if(q.reponse.type === 'image') {
    const img = IMAGE_DB[q.reponse.ref];
    if(!img) return '';
    const reduire = q.soustag === 'Ordre chronologique' || q.soustag === 'Ligne du temps';
    const imgStyle = reduire ? ' style="max-width:75%"' : '';
    return '<div class="doc-img-wrap"><img src="' + escAttr(img.src) + '" alt="Image de réponse" class="doc-img"' + imgStyle + ' onclick="' + escAttr("openLightbox('" + jsStr(img.src) + "')") + '" title="Cliquer pour agrandir"></div>';
  }
  if(q.reponse.type === 'lignes') {
    const n = Math.max(1, q.reponse.nombre || 1);
    return '<div>' + Array(n).fill('<div style="border-bottom:1px solid var(--border);height:28px;margin:6px 0"></div>').join('') + '</div>';
  }
  if(q.reponse.type === 'tableau') {
    let html = '<table style="border-collapse:collapse;margin:8px 0;font-size:0.8rem;">'
      + '<tr><th style="border:0.5px solid var(--border);padding:4px 8px;background:var(--paper-2);text-align:left"></th>'
      + '<th style="border:0.5px solid var(--border);padding:4px 8px;background:var(--paper-2);text-align:center">Document</th></tr>';
    (q.reponse.lignes||[]).forEach(l=>{
      html += '<tr><td style="border:0.5px solid var(--border);padding:4px 8px">' + escLine(l.label) + '</td>'
            + '<td style="border:0.5px solid var(--border);padding:4px 30px"></td></tr>';
    });
    html += '</table>';
    return html;
  }
  if(q.reponse.type === 'grille') {
    const {entetes=[], rangees=[]} = q.reponse;
    const TH = 'border:0.5px solid var(--border);padding:4px 8px;background:var(--paper-2);text-align:center;font-weight:600;font-size:0.8rem';
    const TD = 'border:0.5px solid var(--border);padding:4px 8px;font-size:0.8rem';
    let html = '<table style="border-collapse:collapse;margin:8px 0;">';
    html += '<tr>' + entetes.map(h => `<th style="${TH}">${escLine(h)}</th>`).join('') + '</tr>';
    rangees.forEach(row => {
      html += '<tr>' + row.map((cell, ci) => `<td style="${TD}${ci===0?';font-weight:500':';min-width:60px;height:24px'}">${escLine(cell)}</td>`).join('') + '</tr>';
    });
    html += '</table>';
    return html;
  }
  if(q.reponse.type === 'tableau_2col') {
    const CS = 'border:1px solid var(--ink-2);text-align:center;padding:6px 8px;font-size:0.8rem;width:113px';
    return '<table style="border-collapse:collapse;margin:8px 0;">'
      + '<tr><td style="' + CS + ';font-weight:600;background:var(--paper-2)">Réponse</td>'
      + '<td style="' + CS + ';background:var(--paper);height:40px"></td></tr>'
      + '</table>';
  }
  if(q.reponse.type === 'cause-consequence') {
    const B = 'border:1px solid var(--ink-2)';
    const TH = B + ';text-align:center;font-weight:600;padding:6px 8px;font-size:0.8rem;white-space:nowrap';
    const TC = B + ';text-align:center;padding:8px 16px';
    const circle = '<span style="display:inline-block;width:1.25cm;height:1.25cm;border-radius:50%;border:1.5px solid #000"></span>';
    return '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0">'
      + ['Cause','Conséquence'].map(l => '<tr><td style="' + TH + '">' + l + '</td><td style="' + TC + '">' + circle + '</td></tr>').join('')
      + '</table>';
  }
  if(q.reponse.type === 'mettre-en-relation') {
    const els = q.reponse.elements || [];
    const n = els.length;
    const B = 'border:1px solid var(--ink-2)';
    const circle = '<span style="display:inline-block;width:1.25cm;height:1.25cm;border-radius:50%;border:1.5px solid #000"></span>';
    const TH = B + ';text-align:center;font-weight:600;padding:6px 8px;font-size:0.8rem';
    const TC = B + ';text-align:center;padding:8px 4px';
    const colPct = Math.floor(100 / n) + '%';
    if(n === 2 && q.reponse.double) {
      const BT = 'border-top:1px solid var(--ink-2);border-bottom:1px solid var(--ink-2)';
      const TC_NR = B + ';border-right:none;text-align:center;padding:8px 10px';
      const SN   = BT + ';border-left:none;border-right:none;text-align:center;padding:8px 6px;font-size:0.8rem';
      const TC_NL = B + ';border-left:none;text-align:center;padding:8px 10px';
      return '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0">'
        + els.map(e => '<tr>'
          + '<td style="' + TH + ';white-space:nowrap">' + escLine(e) + '</td>'
          + '<td style="' + TC_NR + '">' + circle + '</td>'
          + '<td style="' + SN + '">et</td>'
          + '<td style="' + TC_NL + '">' + circle + '</td>'
          + '</tr>').join('')
        + '</table>';
    }
    if(n === 2) {
      return '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0">'
        + els.map(e => '<tr><td style="' + TH + ';white-space:nowrap">' + escLine(e) + '</td><td style="' + TC + ';text-align:center;padding:8px 16px">' + circle + '</td></tr>').join('')
        + '</table>';
    }
    return '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0">'
      + '<tr>' + els.map(e => '<td style="' + TH + ';width:' + colPct + '">' + escLine(e) + '</td>').join('') + '</tr>'
      + '<tr>' + els.map(() => '<td style="' + TC + ';text-align:center">' + circle + '</td>').join('') + '</tr>'
      + '</table>';
  }
  if(q.reponse.type === 'situer-dans-lespace') {
    const els = (q.reponse.elements||[]).length ? q.reponse.elements : ['Élément 1','Élément 2'];
    const B = 'border:1px solid var(--ink-2)';
    const TH = B + ';text-align:center;font-weight:600;padding:6px 8px;font-size:0.8rem';
    const TC = B + ';text-align:center;padding:12px 16px';
    const circle = '<span style="display:inline-block;width:1.25cm;height:1.25cm;border-radius:50%;border:1.5px solid #000"></span>';
    return '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0">'
      + '<tr>' + els.map(e => '<td style="' + TH + '">' + escLine(e) + '</td>').join('') + '</tr>'
      + '<tr>' + els.map(() => '<td style="' + TC + '">' + circle + '</td>').join('') + '</tr>'
      + '</table>';
  }
  if(q.reponse.type === 'avant-apres') {
    const lbl = q.reponse.label || '';
    const B = 'border:1px solid var(--ink-2)';
    const circle = '<span style="display:inline-block;width:2cm;height:2cm;border-radius:50%;border:1.5px solid #000"></span>';
    const sideCell = '<div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 4px">' + circle + '<span style="font-size:0.8rem">et</span>' + circle + '</div>';
    return '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0">'
      + '<tr>'
      + '<td style="' + B + ';text-align:center;font-weight:600;padding:6px 8px;font-size:0.8rem;width:33%">Avant</td>'
      + '<td style="' + B + ';text-align:center;font-weight:700;padding:8px;font-size:0.85rem;width:34%;vertical-align:middle" rowspan="2">' + escLine(lbl) + '</td>'
      + '<td style="' + B + ';text-align:center;font-weight:600;padding:6px 8px;font-size:0.8rem;width:33%">Après</td>'
      + '</tr><tr>'
      + '<td style="' + B + '">' + sideCell + '</td>'
      + '<td style="' + B + '">' + sideCell + '</td>'
      + '</tr></table>';
  }
  return '';
}

// ===== LIGHTBOX avec zoom molette + pinch =====
(function() {
  let lbScale = 1, lbX = 0, lbY = 0;
  let lbDragging = false, lbDragStart = {x:0, y:0}, lbPos = {x:0, y:0};
  let lbLastDist = 0;

  function lbApply(img) {
    img.style.transform = 'translate(' + lbX + 'px,' + lbY + 'px) scale(' + lbScale + ')';
    img.style.cursor = lbScale > 1 ? (lbDragging ? 'grabbing' : 'grab') : 'zoom-in';
  }
  function lbReset(img) {
    lbScale = 1; lbX = 0; lbY = 0; lbApply(img);
  }

  window.openLightbox = function(src) {
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    img.src = src;
    lbReset(img);
    lb.classList.add('open');
  };
  window.closeLightbox = function() {
    document.getElementById('lightbox').classList.remove('open');
  };

  document.addEventListener('DOMContentLoaded', function() {
    const lb  = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    if(!lb || !img) return;

    // Clic sur le fond → fermer
    lb.addEventListener('click', function(e) {
      if(e.target === lb) closeLightbox();
    });

    // Molette → zoom centré sur le curseur
    lb.addEventListener('wheel', function(e) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.15 : 1/1.15;
      const newScale = Math.min(8, Math.max(1, lbScale * delta));
      if(newScale === 1) { lbReset(img); return; }
      // Décaler pour zoomer sur la position du curseur
      const rect = img.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width/2);
      const cy = e.clientY - (rect.top + rect.height/2);
      lbX += cx * (1 - delta);
      lbY += cy * (1 - delta);
      lbScale = newScale;
      lbApply(img);
    }, {passive: false});

    // Drag (déplacer l'image zoomée)
    img.addEventListener('mousedown', function(e) {
      if(lbScale <= 1) return;
      lbDragging = true;
      lbDragStart = {x: e.clientX - lbX, y: e.clientY - lbY};
      lbApply(img);
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if(!lbDragging) return;
      lbX = e.clientX - lbDragStart.x;
      lbY = e.clientY - lbDragStart.y;
      lbApply(img);
    });
    document.addEventListener('mouseup', function() {
      if(lbDragging) { lbDragging = false; lbApply(img); }
    });

    // Pinch (mobile)
    lb.addEventListener('touchstart', function(e) {
      if(e.touches.length === 2) {
        lbLastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, {passive: true});
    lb.addEventListener('touchmove', function(e) {
      if(e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const delta = dist / lbLastDist;
        lbScale = Math.min(8, Math.max(1, lbScale * delta));
        lbLastDist = dist;
        if(lbScale === 1) { lbX = 0; lbY = 0; }
        lbApply(img);
      }
    }, {passive: false});

    // Double-clic → reset zoom
    img.addEventListener('dblclick', function() { lbReset(img); });
  });
})();

const _tzStore = [];
const _tzSizes = [0.82, 0.92, 1.02, 1.18, 1.35, 1.6];
let _tzSizeIdx = 2; // défaut : 1.02rem
function openTextZoom(idx) {
  const entry = _tzStore[idx];
  if(!entry) return;
  document.getElementById('text-zoom-title').textContent = entry.titre || '';
  document.getElementById('text-zoom-body').innerHTML = entry.html;
  document.getElementById('text-zoom-body').style.fontSize = _tzSizes[_tzSizeIdx] + 'rem';
  document.getElementById('text-zoom-overlay').classList.add('open');
}
function tzAdjust(dir) {
  _tzSizeIdx = Math.max(0, Math.min(_tzSizes.length - 1, _tzSizeIdx + dir));
  document.getElementById('text-zoom-body').style.fontSize = _tzSizes[_tzSizeIdx] + 'rem';
}
function closeTextZoom(e) {
  if(e && e.target !== document.getElementById('text-zoom-overlay')) return;
  document.getElementById('text-zoom-overlay').classList.remove('open');
}
function closeTextZoomBtn() {
  document.getElementById('text-zoom-overlay').classList.remove('open');
}


async function previsualiser(guideMode) {
  if(panier.length === 0) { showWarn('Le panier est vide.'); return; }
  await ensureDataLoaded();
  const body = document.getElementById('preview-body');
  if(guideMode) {
    // Guide preview — numéros + réponses seulement
    let html = '<div style="font-size:0.85rem;font-weight:600;color:var(--ink);margin-bottom:1.5rem;letter-spacing:0.05em;text-transform:uppercase">Guide de correction</div>';
    panier.forEach(function(id, idx) {
      const q = Q_MAP.get(id);
      if(!q) return;
      let guideContent = '';
      if(q.guide) {
        if(typeof q.guide === 'string') {
          guideContent = '<span style="font-size:0.9rem;color:var(--ink)">' + formatTexte(q.guide) + '</span>';
        } else if(q.guide.type === 'grille' || q.guide.type === 'tableau') {
          const TH = 'border:0.5px solid var(--border);padding:3px 10px;background:var(--paper-2);font-weight:600';
          const TD = 'border:0.5px solid var(--border);padding:3px 10px';
          guideContent = '<table style="border-collapse:collapse;font-size:0.8rem;margin-top:4px">';
          if(q.guide.type === 'grille') {
            guideContent += '<tr>' + (q.guide.entetes||[]).map(h=>`<th style="${TH}">${escLine(h)}</th>`).join('') + '</tr>';
            (q.guide.rangees||[]).forEach(function(row) {
              guideContent += '<tr>' + row.map(function(cell,ci){ return `<td style="${TD}${ci===0?';font-weight:500':''}">${escLine(cell)}</td>`; }).join('') + '</tr>';
            });
          } else {
            guideContent += `<tr><th style="${TH}"></th><th style="${TH}">Document</th></tr>`;
            (q.guide.lignes||[]).forEach(function(l) {
              guideContent += `<tr><td style="${TD};font-weight:500">${escLine(l.label)}</td><td style="${TD};text-align:center">${escLine(l.valeur)}</td></tr>`;
            });
          }
          guideContent += '</table>';
        }
      } else {
        guideContent = '<span style="font-size:0.9rem;color:var(--ink-3);font-style:italic">—</span>';
      }
      html += '<div class="preview-question" style="margin-bottom:0.75rem;padding-bottom:0.75rem">'
        + '<span style="font-weight:500;color:var(--ink-2)">' + (idx+1) + '.&nbsp;&nbsp;</span>'
        + guideContent
        + '</div>';
    });
    body.innerHTML = html;
  } else {
    const examNom    = (document.getElementById('exam-nom')?.value || '').trim();
    const showEleve  = !!document.getElementById('exam-eleve')?.checked;
    const showGroupe = !!document.getElementById('exam-groupe')?.checked;
    const showDate   = !!document.getElementById('exam-date')?.checked;
    const showScore  = !!document.getElementById('exam-score')?.checked;
    const showComm   = !!document.getElementById('exam-commentaires')?.checked;
    const totalPrevPts = panier.reduce((s,id) => { const q=Q_MAP.get(id); return s+(q?.points||0); }, 0);

    let previewHtml = '';
    if(examNom || showEleve || showGroupe || showDate || showScore) {
      previewHtml += '<div style="margin-bottom:1.5rem">';
      if(examNom) previewHtml += '<div style="text-align:center;font-size:1.15rem;font-weight:700;letter-spacing:0.04em;margin-bottom:0.6rem">' + examNom.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
      previewHtml += '<div style="border-top:3px solid #000;margin-bottom:0.75rem"></div>';
      const hasFields = showEleve || showGroupe || showDate || showScore;
      if(hasFields) {
        previewHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 2rem;font-size:1rem;font-weight:700">';
        if(showEleve)  previewHtml += '<div>Élève : _________________________</div>';
        if(showGroupe) previewHtml += '<div>Groupe : ________________________</div>';
        else if(showEleve) previewHtml += '<div></div>';
        if(showDate)   previewHtml += '<div>Date : __________________________</div>';
        if(showScore)  previewHtml += '<div style="text-align:right">_____ / ' + totalPrevPts + ' pts</div>';
        previewHtml += '</div>';
      }
      previewHtml += '</div>';
    }

    previewHtml += panier.map(function(id, idx) {
      const q = Q_MAP.get(id);
      const r = REGLETTES[id];
      if(!q) return '';
      let docsHtml = '';
      const docsR = docsForRender(q.documents);
      if(docsR.length) {
        docsHtml = '<div class="preview-docs">';
        docsR.forEach(function(d) {
          if(d.type === 'tableau') {
            docsHtml += '<table style="width:100%;border-collapse:collapse;margin-bottom:8px"><tr>';
            d.cols.forEach(function(col) {
              const img = IMAGE_DB[col.ref];
              const titre = (col.titreWeb && col.titre) ? col.titre : col.ref;
              docsHtml += '<td style="width:' + Math.floor(100/d.cols.length) + '%;padding:6px;vertical-align:top;border:0.5px solid var(--border)">';
              docsHtml += '<div style="font-size:0.75rem;font-style:italic;margin-bottom:4px;color:var(--ink-2)">' + escLine(titre) + '</div>';
              if(img) docsHtml += '<img src="' + escAttr(img.src) + '" alt="' + escAttr(col.titre||col.ref||'Document') + '" style="max-width:100%;max-height:100px;object-fit:contain;cursor:pointer" onclick="' + escAttr("openLightbox('" + jsStr(img.src) + "')") + '">';
              docsHtml += '</td>';
            });
            docsHtml += '</tr></table>';
          } else if(d.type === 'textes') {
            const cpr = d.colsPerRow || d.cols.length || 1;
            const colW = Math.floor(100/cpr);
            const renderCol = function(col) {
              const img = IMAGE_DB[col.ref];
              let h = '<td style="width:' + colW + '%;padding:6px;vertical-align:top;border:0.5px solid var(--border)">';
              h += '<div style="font-size:0.75rem;font-weight:600;color:var(--ink)">' + escLine(col.titre||'') + '</div>';
              if(col.soustitre) h += '<div style="font-size:0.7rem;font-style:italic;color:var(--ink-2);margin-bottom:4px">' + escLine(col.soustitre) + '</div>';
              else h += '<div style="margin-bottom:4px"></div>';
              if(col.texte) {
                h += '<div style="font-size:0.72rem;color:var(--ink-2);line-height:1.5">' + formatTexte(col.texte) + '</div>';
              } else if(img) {
                h += '<img src="' + escAttr(img.src) + '" alt="' + escAttr(col.titre||col.ref||'Document') + '" style="max-width:100%;max-height:100px;object-fit:contain;cursor:pointer" onclick="' + escAttr("openLightbox('" + jsStr(img.src) + "')") + '">';
              }
              if(col.auteur) h += '<div style="font-size:0.7rem;color:var(--ink-2);margin-top:4px;font-style:italic">' + escLine(col.auteur) + '</div>';
              if(col.source) h += '<div style="font-size:0.65rem;color:var(--ink-3);margin-top:2px;font-style:italic">' + escLine(col.source) + '</div>';
              h += '</td>';
              return h;
            };
            docsHtml += '<table style="width:100%;border-collapse:collapse;margin-bottom:8px">';
            for(let i=0; i<d.cols.length; i+=cpr) {
              docsHtml += '<tr>' + d.cols.slice(i, i+cpr).map(renderCol).join('') + '</tr>';
            }
            docsHtml += '</table>';
          }
        });
        docsHtml += '</div>';
      }
      let regHtml = '';
      if(r) {
        if(r.variante) {
          regHtml = '<div class="preview-reglette">' + buildReglettHTML(q) + '</div>';
        } else {
          regHtml = '<div class="preview-reglette"><table><tr><td class="r-label" rowspan="2">' + escLine(r.oi) + '</td>';
          regHtml += (r.colonnes||[]).map(function(c) { return '<td style="text-align:center;background:var(--paper-2)">' + escLine(c) + '</td>'; }).join('');
          regHtml += '</tr><tr>' + (r.niveaux||[]).map(function(n) { return '<td>' + escLine(n.desc) + '</td>'; }).join('') + '</tr></table></div>';
        }
      }
      // Réponse in preview
      let previewReponse = '';
      if(q.reponse && q.reponse !== false) {
        if(q.reponse === true) {
          previewReponse = '<div class="reponse-courte" style="margin:8px 0">__________</div>';
        } else if(q.reponse.type === 'tableau_3col') {
          const {col1='', col2='', col3=''} = q.reponse;
          const S = 'border:1px solid #999;text-align:center;font-weight:600;padding:6px 8px;font-size:0.75rem';
          previewReponse = '<table style="border-collapse:collapse;margin:8px 0;">'
            + '<tr>'
            + '<td style="' + S + '">' + escLine(col1) + '</td>'
            + '<td style="' + S + ';vertical-align:middle" rowspan="2">' + escLine(col2) + '</td>'
            + '<td style="' + S + '">' + escLine(col3) + '</td>'
            + '</tr><tr>'
            + '<td style="border:1px solid #999;background:#f0f0f0;height:40px;min-width:80px"></td>'
            + '<td style="border:1px solid #999;background:#f0f0f0;height:40px;min-width:80px"></td>'
            + '</tr></table>';
        } else if(q.reponse.type === 'image') {
          const imgPrev = IMAGE_DB[q.reponse.ref];
          if(imgPrev) previewReponse += '<img src="' + escAttr(imgPrev.src) + '" style="max-width:100%;max-height:80px;object-fit:contain;margin:8px 0;display:block">';
        } else if(q.reponse.type === 'lignes') {
          previewReponse = Array(Math.max(1, q.reponse.nombre || 1)).fill('<div class="reponse-ligne-pleine" style="border-bottom:1px solid #999;height:28px;margin:6px 0"></div>').join('');
        } else if(q.reponse.type === 'tableau') {
          previewReponse = '<table style="border-collapse:collapse;margin:8px 0;font-size:0.8rem;">'
            + '<tr><th style="border:0.5px solid #ccc;padding:4px 8px;background:#f5f5f5"></th><th style="border:0.5px solid #ccc;padding:4px 8px;background:#f5f5f5">Document</th></tr>'
            + (q.reponse.lignes||[]).map(function(l){return '<tr><td style="border:0.5px solid #ccc;padding:4px 8px">' + escLine(l.label) + '</td><td style="border:0.5px solid #ccc;padding:4px 30px"></td></tr>';}).join('')
            + '</table>';
        } else if(q.reponse.type === 'grille') {
          const {entetes=[], rangees=[]} = q.reponse;
          const TH2 = 'border:0.5px solid #ccc;padding:4px 8px;background:#f5f5f5;text-align:center;font-weight:600;font-size:0.8rem';
          const TD2 = 'border:0.5px solid #ccc;padding:4px 8px;font-size:0.8rem';
          previewReponse = '<table style="border-collapse:collapse;margin:8px 0;">';
          previewReponse += '<tr>' + entetes.map(h => `<th style="${TH2}">${escLine(h)}</th>`).join('') + '</tr>';
          rangees.forEach(row => {
            previewReponse += '<tr>' + row.map((cell, ci) => `<td style="${TD2}${ci===0?';font-weight:500':';min-width:60px;height:24px'}">${escLine(cell)}</td>`).join('') + '</tr>';
          });
          previewReponse += '</table>';
        } else if(q.reponse.type === 'cause-consequence') {
          const BCC = 'border:1px solid #999';
          const THCC = BCC + ';text-align:center;font-weight:600;padding:6px 8px;font-size:0.75rem;white-space:nowrap';
          const TCCC = BCC + ';text-align:center;padding:8px 16px';
          const circleCC = '<span style="display:inline-block;width:1.25cm;height:1.25cm;border-radius:50%;border:1.5px solid #000"></span>';
          previewReponse = '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0">'
            + ['Cause','Conséquence'].map(l => '<tr><td style="' + THCC + '">' + l + '</td><td style="' + TCCC + '">' + circleCC + '</td></tr>').join('')
            + '</table>';
        } else if(q.reponse.type === 'tableau_2col') {
          const CS = 'border:1px solid #999;text-align:center;padding:6px 8px;font-size:0.8rem;width:113px';
          previewReponse = '<table style="border-collapse:collapse;margin:8px 0;">'
            + '<tr><td style="' + CS + ';font-weight:600;background:#f5f5f5">Réponse</td>'
            + '<td style="' + CS + ';height:40px"></td></tr>'
            + '</table>';
        } else if(q.reponse.type === 'mettre-en-relation') {
          const els = q.reponse.elements || [];
          const n = els.length;
          const BM = 'border:1px solid #999';
          const circle3 = '<span style="display:inline-block;width:1.25cm;height:1.25cm;border-radius:50%;border:1.5px solid #000"></span>';
          const THM = BM + ';text-align:center;font-weight:600;padding:6px 8px;font-size:0.75rem';
          const TCM = BM + ';text-align:center;padding:8px 4px';
          const colPctM = Math.floor(100 / n) + '%';
          if(n === 2 && q.reponse.double) {
            const BTM = 'border-top:1px solid #999;border-bottom:1px solid #999';
            const TCM_NR = BM + ';border-right:none;text-align:center;padding:8px 10px';
            const SNM    = BTM + ';border-left:none;border-right:none;text-align:center;padding:8px 6px;font-size:0.75rem';
            const TCM_NL = BM + ';border-left:none;text-align:center;padding:8px 10px';
            previewReponse = '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0">'
              + els.map(e => '<tr>'
                + '<td style="' + THM + ';white-space:nowrap">' + escLine(e) + '</td>'
                + '<td style="' + TCM_NR + '">' + circle3 + '</td>'
                + '<td style="' + SNM + '">et</td>'
                + '<td style="' + TCM_NL + '">' + circle3 + '</td>'
                + '</tr>').join('')
              + '</table>';
          } else if(n === 2) {
            previewReponse = '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0">'
              + els.map(e => '<tr><td style="' + THM + ';white-space:nowrap">' + escLine(e) + '</td><td style="' + TCM + ';text-align:center;padding:8px 16px">' + circle3 + '</td></tr>').join('')
              + '</table>';
          } else {
            previewReponse = '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0">'
              + '<tr>' + els.map(e => '<td style="' + THM + ';width:' + colPctM + '">' + escLine(e) + '</td>').join('') + '</tr>'
              + '<tr>' + els.map(() => '<td style="' + TCM + ';text-align:center">' + circle3 + '</td>').join('') + '</tr>'
              + '</table>';
          }
        } else if(q.reponse.type === 'situer-dans-lespace') {
          const elsS = (q.reponse.elements||[]).length ? q.reponse.elements : ['Élément 1','Élément 2'];
          const BSde = 'border:1px solid #999';
          const THSde = BSde + ';text-align:center;font-weight:600;padding:6px 8px;font-size:0.75rem';
          const TCSde = BSde + ';text-align:center;padding:12px 16px';
          const circleSde = '<span style="display:inline-block;width:1.25cm;height:1.25cm;border-radius:50%;border:1.5px solid #000"></span>';
          previewReponse = '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0">'
            + '<tr>' + elsS.map(e => '<td style="' + THSde + '">' + escLine(e) + '</td>').join('') + '</tr>'
            + '<tr>' + elsS.map(() => '<td style="' + TCSde + '">' + circleSde + '</td>').join('') + '</tr>'
            + '</table>';
        } else if(q.reponse.type === 'avant-apres') {
          const lbl = q.reponse.label || '';
          const B2 = 'border:1px solid #999';
          const circle2 = '<span style="display:inline-block;width:2cm;height:2cm;border-radius:50%;border:1.5px solid #000"></span>';
          const sideCell2 = '<div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 4px">' + circle2 + '<span style="font-size:0.75rem">et</span>' + circle2 + '</div>';
          previewReponse = '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0">'
            + '<tr>'
            + '<td style="' + B2 + ';text-align:center;font-weight:600;padding:6px 8px;font-size:0.75rem;width:33%">Avant</td>'
            + '<td style="' + B2 + ';text-align:center;font-weight:700;padding:8px;font-size:0.8rem;width:34%;vertical-align:middle" rowspan="2">' + escLine(lbl) + '</td>'
            + '<td style="' + B2 + ';text-align:center;font-weight:600;padding:6px 8px;font-size:0.75rem;width:33%">Après</td>'
            + '</tr><tr>'
            + '<td style="' + B2 + '">' + sideCell2 + '</td>'
            + '<td style="' + B2 + '">' + sideCell2 + '</td>'
            + '</tr></table>';
        }
      }

      return '<div class="preview-question"><div class="preview-num">Question ' + (idx+1) + '</div>'
        + '<div class="preview-enonce">' + formatTexte(q.enonce) + '</div>'
        + docsHtml + previewReponse + regHtml + '</div>';
    }).join('');

    if(showComm) {
      previewHtml += '<div style="margin-top:1.5rem;padding-top:1rem">'
        + '<div style="font-weight:600;font-size:0.85rem;margin-bottom:0.5rem">Commentaires :</div>'
        + '<div style="border-bottom:1px solid #bbb;height:28px;margin-bottom:6px"></div>'.repeat(3)
        + '</div>';
    }

    body.innerHTML = previewHtml;
  }
  document.getElementById('preview-modal-label').textContent = guideMode ? 'Prévisualisation du guide' : 'Prévisualisation du cahier';
  document.getElementById('preview-modal').classList.add('open');
}

function closePreview(e) {
  if(e.target === document.getElementById('preview-modal')) closePreviewBtn();
}
function closePreviewBtn() {
  document.getElementById('preview-modal').classList.remove('open');
}

function togglePanier(id) {
  if(panier.includes(id)) {
    panier = panier.filter(x => x !== id);
  } else {
    if(panier.length >= 20) { showWarn('Maximum 20 questions dans le panier.'); return; }
    panier.push(id);
  }
  updatePanierBar();
  updateTileState(id);
  updateQModalBtn(id);
}

function refreshPanierButtons() {
  panier.forEach(id => updateTileState(id));
}

function updatePanierBar() {
  const bar = document.getElementById('panier-bar');
  const count = document.getElementById('panier-count');
  const totalPts = panier.reduce((s, id) => { const q = Q_MAP.get(id); return s+(q?q.points:0); }, 0);
  count.textContent = panier.length + ' / 20  ·  ' + totalPts + ' pt' + (totalPts !== 1 ? 's' : '');
  bar.classList.toggle('visible', panier.length > 0);
  try { localStorage.setItem('hqc_panier', JSON.stringify(panier)); } catch(e) {}
  if(document.getElementById('cahier-panel').classList.contains('open')) renderCahier();
}

function retirerPanier(id) {
  panier = panier.filter(x => x !== id);
  updateTileState(id);
  updateQModalBtn(id);
  updatePanierBar();
}

function viderPanier() {
  if(panier.length && !confirm('Vider le panier ?')) return;
  const ids = [...panier];
  panier = [];
  ids.forEach(id => updateTileState(id));
  const modalBtn = document.getElementById('q-modal-panier-btn');
  if(modalBtn && modalBtn.dataset.id) updateQModalBtn(modalBtn.dataset.id);
  updatePanierBar();
}

function showWarn(msg) {
  const t = document.getElementById('warn-toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// === CAHIER EN CONSTRUCTION ===
let cahierDragSrc = null;
let cahierDragLast = null;

function melangerPanier() {
  for(let i = panier.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [panier[i], panier[j]] = [panier[j], panier[i]];
  }
  updatePanierBar();
}

function openCahier() {
  renderCahier();
  document.getElementById('cahier-panel').classList.add('open');
  document.getElementById('cahier-backdrop').classList.add('open');
}

function closeCahier() {
  document.getElementById('cahier-panel').classList.remove('open');
  document.getElementById('cahier-backdrop').classList.remove('open');
}

function renderCahier() {
  const body = document.getElementById('cahier-body');
  const sub  = document.getElementById('cahier-panel-sub');
  const stats = document.getElementById('cahier-footer-stats');
  const totalPts = panier.reduce((s, id) => { const q = Q_MAP.get(id); return s+(q?q.points:0); }, 0);

  const nQ = panier.length;
  sub.textContent = nQ + ' question' + (nQ !== 1 ? 's' : '') + ' · ' + totalPts + ' pt' + (totalPts !== 1 ? 's' : '');
  stats.innerHTML = '<strong>' + nQ + '</strong> question' + (nQ !== 1 ? 's' : '')
    + ' — <strong>' + totalPts + '</strong> point' + (totalPts !== 1 ? 's' : '') + ' au total';

  if(!nQ) {
    body.innerHTML = '<div class="cahier-empty">Aucune question dans le panier.<br>Utilisez le bouton <em>+ Ajouter</em> sur les cartes.</div>';
    return;
  }

  body.innerHTML = panier.map((id, i) => {
    const q = Q_MAP.get(id);
    if(!q) return '';
    const st = oiStyle(q.oi);
    const oiShort = q.oi.length > 30 ? q.oi.slice(0,30) + '…' : q.oi;
    const rawEnonce = (q.enonce||'').replace(/\*\*(.*?)\*\*/g,'$1').replace(/[•\-] /g,'').trim();
    const preview = rawEnonce.length > 65 ? rawEnonce.slice(0,65) + '…' : rawEnonce;
    return `<div class="cahier-item" draggable="true" data-id="${escAttr(id)}"
      ondragstart="cahierDragStart(event)" ondragover="cahierDragOver(event)"
      ondrop="cahierDrop(event)" ondragend="cahierDragEnd(event)">
      <div class="cahier-accent" style="background:${st.color}"></div>
      <div class="cahier-handle">⋮⋮</div>
      <div class="cahier-item-body">
        <div class="cahier-item-row">
          <span class="cahier-num">Q${i+1}</span>
          <span class="cahier-badge" style="color:${st.color};background:${st.bg}" title="${escAttr(q.oi)}">${escLine(oiShort)}</span>
          <span class="cahier-pts">${q.points} pt${q.points !== 1 ? 's' : ''}</span>
        </div>
        <div class="cahier-enonce">${escLine(preview)}</div>
      </div>
      <button class="cahier-remove" onclick="retirerPanier('${id}')">×</button>
    </div>`;
  }).join('');
}

function cahierDragStart(e) {
  cahierDragSrc = e.currentTarget;
  cahierDragSrc.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function cahierDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if(cahierDragLast && cahierDragLast !== target) cahierDragLast.classList.remove('drop-top','drop-bottom');
  cahierDragLast = target;
  if(target === cahierDragSrc) return;
  const rect = target.getBoundingClientRect();
  target.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-top' : 'drop-bottom');
}

function cahierDrop(e) {
  e.preventDefault();
  const fromId = cahierDragSrc?.dataset.id;
  const toId   = e.currentTarget.dataset.id;
  if(!fromId || fromId === toId) return;
  const before = e.currentTarget.classList.contains('drop-top');
  const fi = panier.indexOf(fromId);
  if(fi === -1) return;
  panier.splice(fi, 1);
  const ti = panier.indexOf(toId);
  panier.splice(before ? ti : ti + 1, 0, fromId);
  updatePanierBar();
}

function cahierDragEnd() {
  if(cahierDragSrc) cahierDragSrc.classList.remove('dragging');
  if(cahierDragLast) cahierDragLast.classList.remove('drop-top','drop-bottom');
  cahierDragSrc = null;
  cahierDragLast = null;
}

// ===== RÉSOLUTION DES IMAGES (fetch → base64 + dimensions) =====
async function resolveImages(neededKeys) {
  const MAX_PX = 1200;
  const JPEG_Q = 0.78;
  const failed = [];

  const promises = neededKeys.map(async key => {
    const entry = IMAGE_DB[key];
    if (!entry || _imgDocxCache[key]) return;
    try {
      const resp = await fetch(entry.src);
      const blob = await resp.blob();
      const isJpeg = blob.type === 'image/jpeg' || key.match(/\.(jpg|jpeg)$/i);
      const dataUrl = await new Promise((res, rej) => {
        const img = new Image();
        const blobUrl = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(blobUrl);
          const scale = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.round(img.naturalWidth * scale);
          const h = Math.round(img.naturalHeight * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          res({ url: canvas.toDataURL(isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? JPEG_Q : undefined), w, h });
        };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); rej(); };
        img.src = blobUrl;
      });
      _imgDocxCache[key] = { src: dataUrl.url, w: dataUrl.w, h: dataUrl.h };
    } catch(e) {
      failed.push(key);
      console.warn('Impossible de charger l\'image :', key, e);
    }
  });
  await Promise.all(promises);
  return failed;
}

// ===== GÉNÉRATION DOCX (browser) =====
let _docxLoadPromise = null;
async function genererDocx(includeGuide=false) {
  if(panier.length === 0) return;
  await ensureDataLoaded();
  const btn = includeGuide ? document.getElementById('btn-generer-guide') : document.getElementById('btn-generer');
  const btnOther = includeGuide ? document.getElementById('btn-generer') : document.getElementById('btn-generer-guide');
  if(btn) { btn.disabled = true; btn.textContent = '⏳ Génération…'; }
  if(btnOther) btnOther.disabled = true;

  try {
    if(typeof docx === 'undefined') {
      if(!_docxLoadPromise) {
        _docxLoadPromise = new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'docx.js';
          s.onload = res;
          s.onerror = () => { _docxLoadPromise = null; rej(new Error('Impossible de charger docx.js')); };
          document.head.appendChild(s);
        });
      }
      await _docxLoadPromise;
    }
    const panierQuestions = panier.map(id => Q_MAP.get(id)).filter(Boolean);
    const imgR = k => _imgDocxCache[k] || IMAGE_DB[k]; // lit depuis le cache DOCX, pas IMAGE_DB (évite de muter IMAGE_DB avec des data URLs)
    const neededKeys = new Set();
    const missingFromDb = new Set(); // ref utilisée mais absente d'IMAGE_DB (donnée incomplète/orpheline)
    const track = ref => { if(!ref) return; if(IMAGE_DB[ref]) neededKeys.add(ref); else missingFromDb.add(ref); };
    panierQuestions.forEach(q => {
      (q.documents || []).forEach(d => {
        if(d.cols) d.cols.forEach(c => track(c.ref));
        track(d.ref);
      });
      if(q.reponse) track(q.reponse.ref);
    });
    const failedImgs = await resolveImages([...neededKeys]);
    const allMissing = [...missingFromDb, ...failedImgs];
    if(allMissing.length) showWarn('Images introuvables dans le DOCX : ' + allMissing.join(', '));
    const {
      Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      AlignmentType, BorderStyle, WidthType, VerticalAlign, XmlComponent
    } = docx;

    const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
    const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    const CELL_MARGINS = { top: 60, bottom: 60, left: 80, right: 80 };
    const PAGE_W = 9360; // 6.5 inches content width in DXA
    const COL_2CM = 1134; // 2 cm in DXA

    // DrawingML ellipse shape: injects raw wp:inline XML into a w:r run
    let _aaShapeId = 10000 + Math.floor(Math.random() * 1000);
    class EllipseRun extends XmlComponent {
      constructor(cx, cy) {
        super('w:r');
        this._id = String(++_aaShapeId);
        this._cx = String(cx);
        this._cy = String(cy);
      }
      prepForXml(ctx) {
        if(ctx && ctx.stack) { ctx.stack.push(this); ctx.stack.pop(); }
        const { _cx: cx, _cy: cy, _id: id } = this;
        return { 'w:r': [{ 'w:drawing': [{ 'wp:inline': [
          { _attr: { distT:'0', distB:'0', distL:'0', distR:'0' } },
          { 'wp:extent':         [{ _attr: { cx, cy } }] },
          { 'wp:effectExtent':   [{ _attr: { l:'0', t:'0', r:'0', b:'0' } }] },
          { 'wp:docPr':          [{ _attr: { id, name:'Ellipse '+id } }] },
          { 'wp:cNvGraphicFramePr': {} },
          { 'a:graphic': [
            { _attr: { 'xmlns:a':'http://schemas.openxmlformats.org/drawingml/2006/main' } },
            { 'a:graphicData': [
              { _attr: { uri:'http://schemas.microsoft.com/office/word/2010/wordprocessingShape' } },
              { 'wps:wsp': [
                { _attr: { 'xmlns:wps':'http://schemas.microsoft.com/office/word/2010/wordprocessingShape' } },
                { 'wps:cNvSpPr': {} },
                { 'wps:spPr': [
                  { 'a:xfrm': [
                    { 'a:off': [{ _attr: { x:'0', y:'0' } }] },
                    { 'a:ext': [{ _attr: { cx, cy } }] }
                  ] },
                  { 'a:prstGeom': [{ _attr: { prst:'ellipse' } }, { 'a:avLst': {} }] },
                  { 'a:noFill': {} },
                  { 'a:ln': [{ 'a:solidFill': [{ 'a:srgbClr': [{ _attr: { val:'000000' } }] }] }] }
                ] },
                { 'wps:bodyPr': [{ _attr: { anchor:'ctr' } }] }
              ] }
            ] }
          ] }
        ] }] }] };
      }
    }

    function b64ToBytes(src) {
      const b64 = src.split(',')[1];
      if(!b64) return null;
      const bStr = atob(b64);
      const bytes = new Uint8Array(bStr.length);
      for(let i = 0; i < bStr.length; i++) bytes[i] = bStr.charCodeAt(i);
      return bytes;
    }

    function imgWithBorder(bytes, imgType, w, h) {
      return new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new docx.ImageRun({ data: bytes, type: imgType, transformation: { width: w, height: h } })]
      });
    }

    function cellText(text, bold=false) {
      return new TableCell({
        borders: BORDERS,
        margins: CELL_MARGINS,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text, font: 'Aptos', size: 12, bold })]
        })]
      });
    }

    function buildReglette(id) {
      const r = REGLETTES[id];
      if(!r) return [];

      if(r.variante === '3 éléments — 2 liens') {
        const col1 = Math.floor(PAGE_W * 0.22);
        const col2 = Math.floor(PAGE_W * 0.26);
        const col3 = Math.floor(PAGE_W * 0.35);
        const col4 = PAGE_W - col1 - col2 - col3;

        const BN={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
        const BC2={top:BORDER,bottom:BORDER,left:BORDER,right:BN};
        const BC3={top:BORDER,bottom:BORDER,left:BN,right:BN};
        const BC4={top:BORDER,bottom:BORDER,left:BN,right:BORDER};
        const mkCell = (text, bold=false, rowSpan=1, colSpan=1, w=0, b=BORDERS) => new TableCell({
          borders: b, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
          rowSpan: rowSpan > 1 ? rowSpan : undefined,
          columnSpan: colSpan > 1 ? colSpan : undefined,
          width: w ? {size:w, type:WidthType.DXA} : undefined,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text, font: 'Aptos', size: 12, bold })]
          })]
        });

        return [new Table({
          width: { size: 0, type: WidthType.AUTO },
          rows: [
            new TableRow({ children: [mkCell(r.oi, true, 6, 1, col1), mkCell("L'élève précise les trois éléments", false, 3, 1, col2, BC2), mkCell("et établit correctement deux liens de causalité.", false, 1, 1, col3, BC3), mkCell("3 points", false, 1, 1, col4, BC4)] }),
            new TableRow({ children: [mkCell("et établit correctement un lien de causalité.", false, 1, 1, col3, BC3), mkCell("2 points", false, 1, 1, col4, BC4)] }),
            new TableRow({ children: [mkCell("mais n'établit correctement aucun lien de causalité.", false, 1, 1, col3, BC3), mkCell("1 point", false, 1, 1, col4, BC4)] }),
            new TableRow({ children: [mkCell("L'élève précise deux éléments", false, 2, 1, col2, BC2), mkCell("et établit correctement un lien de causalité.", false, 1, 1, col3, BC3), mkCell("2 points", false, 1, 1, col4, BC4)] }),
            new TableRow({ children: [mkCell("mais n'établit correctement aucun lien de causalité.", false, 1, 1, col3, BC3), mkCell("1 point", false, 1, 1, col4, BC4)] }),
            new TableRow({ children: [mkCell("L'élève précise un seul élément ou n'en précise pas.", false, 1, 2, col2+col3, BC2), mkCell("0 point", false, 1, 1, col4, BC4)] }),
          ]
        })];
      }

      if(r.variante === 'acteur-positions') {
        const c1=Math.floor(PAGE_W*0.22), c2=Math.floor(PAGE_W*0.43), c3=Math.floor(PAGE_W*0.22), c4=PAGE_W-c1-c2-c3;
        const BN={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
        const BC2={top:BORDER,bottom:BORDER,left:BORDER,right:BN};
        const BC3={top:BORDER,bottom:BORDER,left:BN,right:BN};
        const BC4={top:BORDER,bottom:BORDER,left:BN,right:BORDER};
        const mk=(t,bold=false,rs=1,cs=1,w=0,b=BORDERS)=>new TableCell({borders:b,margins:CELL_MARGINS,verticalAlign:VerticalAlign.CENTER,rowSpan:rs>1?rs:undefined,columnSpan:cs>1?cs:undefined,width:w?{size:w,type:WidthType.DXA}:undefined,children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:t,font:'Aptos',size:12,bold})]})]});
        return [new Table({width:{size:0,type:WidthType.AUTO},rows:[
          new TableRow({children:[mk(r.oi,true,5,1,c1),mk("L'élève nomme correctement l'acteur qui présente une position différente",false,4,1,c2,BC2),mk("et présente correctement les deux positions.",false,1,1,c3,BC3),mk("3 points",false,1,1,c4,BC4)]}),
          new TableRow({children:[mk("et présente correctement une position et plus ou moins correctement l'autre position.",false,1,1,c3,BC3),mk("2 points",false,1,1,c4,BC4)]}),
          new TableRow({children:[mk("et présente plus ou moins correctement les deux positions, ou présente correctement une position et incorrectement l'autre ou ne la présente pas.",false,1,1,c3,BC3),mk("1 point",false,1,1,c4,BC4)]}),
          new TableRow({children:[mk("et présente tout au plus une seule position plus ou moins correctement.",false,1,1,c3,BC3),mk("0 point",false,1,1,c4,BC4)]}),
          new TableRow({children:[mk("L'élève nomme incorrectement l'acteur qui présente une position différente ou ne le nomme pas.",false,1,2,c2+c3,BC2),mk("0 point",false,1,1,c4,BC4)]}),
        ]})];
      }

      if(r.variante === 'changement-continuité') {
        const c1=Math.floor(PAGE_W*0.22), c2=Math.floor(PAGE_W*0.37), c3=Math.floor(PAGE_W*0.21), c4=PAGE_W-c1-c2-c3;
        const BN={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
        const BC2={top:BORDER,bottom:BORDER,left:BORDER,right:BN};
        const BC3={top:BORDER,bottom:BORDER,left:BN,right:BN};
        const BC4={top:BORDER,bottom:BORDER,left:BN,right:BORDER};
        const mk=(t,bold=false,rs=1,cs=1,w=0,b=BORDERS)=>new TableCell({borders:b,margins:CELL_MARGINS,verticalAlign:VerticalAlign.CENTER,rowSpan:rs>1?rs:undefined,columnSpan:cs>1?cs:undefined,width:w?{size:w,type:WidthType.DXA}:undefined,children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:t,font:'Aptos',size:12,bold})]})]});
        return [new Table({width:{size:0,type:WidthType.AUTO},rows:[
          new TableRow({children:[mk(r.oi,true,6,1,c1),mk("L'élève indique s'il y a changement ou continuité",false,3,1,c2,BC2),mk("et présente des faits qui le montrent correctement.",false,1,1,c3,BC3),mk("3 points (ou 2 points)",false,1,1,c4,BC4)]}),
          new TableRow({children:[mk("et présente des faits qui le montrent plus ou moins correctement.",false,1,1,c3,BC3),mk("2 points (ou 1 point)",false,1,1,c4,BC4)]}),
          new TableRow({children:[mk("et présente des faits qui le montrent incorrectement ou n'en présente pas.",false,1,1,c3,BC3),mk("0 point",false,1,1,c4,BC4)]}),
          new TableRow({children:[mk("L'élève n'indique pas s'il y a changement ou continuité",false,3,1,c2,BC2),mk("mais présente des faits exacts.",false,1,1,c3,BC3),mk("2 points (ou 1 point)",false,1,1,c4,BC4)]}),
          new TableRow({children:[mk("mais présente des faits plus ou moins exacts.",false,1,1,c3,BC3),mk("1 point (ou 0 point)",false,1,1,c4,BC4)]}),
          new TableRow({children:[mk("et présente des faits inexacts ou n'en présente pas.",false,1,1,c3,BC3),mk("0 point",false,1,1,c4,BC4)]}),
        ]})];
      }

      // Standard layout
      const niveaux = r.niveaux || [];
      if(!niveaux.length || !r.colonnes?.length) return [];
      const colOI = Math.floor(PAGE_W * 0.22);
      const colW  = Math.floor((PAGE_W - colOI) / niveaux.length);
      const colLast = PAGE_W - colOI - colW * (niveaux.length - 1);
      const cols = [colOI, ...niveaux.map((_, i) => i === niveaux.length - 1 ? colLast : colW)];

      return [new Table({
        width: { size: PAGE_W, type: WidthType.DXA },
        columnWidths: cols,
        rows: [
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, rowSpan: 2,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.oi, font: 'Aptos', size: 12, bold: true })] })] }),
            ...r.colonnes.map(c => cellText(c))
          ]}),
          new TableRow({ children: niveaux.map(n => cellText(n.desc)) })
        ]
      })];
    }

    function parseEnonce(enonce) {
      return enonce.split('\n').map(line => {
        return new Paragraph({ children: mkRuns(line, 'Aptos', 24) });
      });
    }
    function mkRuns(line, font, size) {
      const parts = line.split(/(\*\*.*?\*\*)/);
      return parts.filter(p=>p).map(p => {
        const bold = p.startsWith('**') && p.endsWith('**');
        return new TextRun({ text: bold ? p.slice(2,-2) : p, font, size, bold });
      });
    }
    function mkLine(line, font, size) {
      if(line.startsWith('• ')) {
        return new Paragraph({ indent:{ left:200 }, children:[new TextRun({text:'• ',font,size}), ...mkRuns(line.slice(2),font,size)] });
      }
      return new Paragraph({ children: mkRuns(line, font, size) });
    }

    const children = [];

    // Exam header (cahier only)
    if(!includeGuide) {
      const examNom    = (document.getElementById('exam-nom')?.value || '').trim();
      const showEleve  = !!document.getElementById('exam-eleve')?.checked;
      const showGroupe = !!document.getElementById('exam-groupe')?.checked;
      const showDate   = !!document.getElementById('exam-date')?.checked;
      const showScore  = !!document.getElementById('exam-score')?.checked;
      const showComm   = !!document.getElementById('exam-commentaires')?.checked;
      const totalDocxPts = panierQuestions.reduce((s,q)=>s+(q.points||0), 0);
      const hasHeader = examNom || showEleve || showGroupe || showDate || showScore;

      if(hasHeader) {
        if(examNom) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: examNom, font:'Aptos', size:36, bold:true })]
          }));
        }
        // Thick black rule under title
        children.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: '000000' } },
          spacing: { before: 80, after: 80 },
          children: [new TextRun({ text: '' })]
        }));
        // 2-col fields row (Élève | Groupe, Date | Résultat)
        const BN_H = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        const HW = Math.floor(PAGE_W / 2);
        const mkHCell = (txt, align) => new TableCell({
          width: { size: HW, type: WidthType.DXA },
          borders: { top: BN_H, bottom: BN_H, left: BN_H, right: BN_H },
          margins: { top: 60, bottom: 60, left: 0, right: 0 },
          children: [new Paragraph({
            alignment: align || AlignmentType.LEFT,
            children: [new TextRun({ text: txt, font:'Aptos', size:24, bold:true })]
          })]
        });
        const fieldRows = [];
        const r1L = showEleve  ? 'Élève : _________________________' : '';
        const r1R = showGroupe ? 'Groupe : ________________________' : '';
        const r2L = showDate   ? 'Date : __________________________' : '';
        const r2R = showScore  ? `_____ / ${totalDocxPts} pts` : '';
        if(r1L || r1R) fieldRows.push(new TableRow({ children: [mkHCell(r1L), mkHCell(r1R, AlignmentType.LEFT)] }));
        if(r2L || r2R) fieldRows.push(new TableRow({ children: [mkHCell(r2L), mkHCell(r2R, AlignmentType.RIGHT)] }));
        if(fieldRows.length) {
          children.push(new Table({
            width: { size: PAGE_W, type: WidthType.DXA },
            columnWidths: [HW, HW],
            borders: { top: BN_H, bottom: BN_H, left: BN_H, right: BN_H, insideH: BN_H, insideV: BN_H },
            rows: fieldRows
          }));
        }
        children.push(new Paragraph({ children: [new TextRun({ text:'' })] }));
        children.push(new Paragraph({ children: [new TextRun({ text:'' })] }));
      }
    }

    if(includeGuide) {
      // Guide — numéros + réponses seulement
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Guide de correction', font: 'Aptos', size: 28, bold: true })]
      }));
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      panier.forEach((id, idx) => {
        const q = Q_MAP.get(id);
        if(!q) return;
        // Toujours numéroter (même sans guide) pour rester aligné avec le cahier et l'aperçu.
        children.push(new Paragraph({ children: [new TextRun({ text: (idx+1) + '.', font: 'Aptos', size: 20, bold: true })] }));
        if(!q.guide) {
          children.push(new Paragraph({ children: [new TextRun({ text: '—', font: 'Aptos', size: 20 })] }));
          children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
          return;
        }
        if(typeof q.guide === 'string') {
          children.push(new Paragraph({ children: [new TextRun({ text: q.guide, font: 'Aptos', size: 20 })] }));
        } else if(q.guide.type === 'grille' || q.guide.type === 'tableau') {
          const mkGCell = (text, bold) => new TableCell({
            borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new TextRun({ text: String(text||''), font:'Aptos', size:20, bold:!!bold })] })]
          });
          let headers, rows;
          if(q.guide.type === 'grille') {
            headers = q.guide.entetes || [];
            rows    = q.guide.rangees || [];
          } else {
            headers = ['', 'Document'];
            rows    = (q.guide.lignes||[]).map(l=>[l.label, l.valeur]);
          }
          const nCols   = headers.length || 2;
          const colW    = Math.floor(PAGE_W / nCols);
          const colWidths = Array(nCols).fill(colW);
          const guideRows = [
            new TableRow({ children: headers.map(h => mkGCell(h, true)) }),
            ...rows.map(row => new TableRow({ children: row.map((cell,ci) => mkGCell(cell, ci===0)) }))
          ];
          children.push(new Table({ width:{ size:PAGE_W, type:WidthType.DXA }, columnWidths:colWidths, rows:guideRows }));
        }
        children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      });
    } else {

    panier.forEach((id, idx) => {
      const q = Q_MAP.get(id);
      if(!q) return;

      // Énoncé avec numéro
      const qNum = idx + 1;
      const firstLine = (q.enonce||'').split('\n')[0];
      const otherLines = (q.enonce||'').split('\n').slice(1);
      children.push(new Paragraph({
        children: [new TextRun({ text: qNum + '.  ', font: 'Aptos', size: 24 }), ...mkRuns(firstLine, 'Aptos', 24)]
      }));
      otherLines.forEach(line => { if(line.trim()) children.push(mkLine(line, 'Aptos', 24)); });
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));

      // Documents
      const docsR = docsForRender(q.documents);
      if(docsR.length) {
        for(let di=0; di<docsR.length; di++) {
          const d = docsR[di];
          if(d.type === 'tableau') {
            if(!(d.cols||[]).length) continue; // document sans colonne (données incomplètes) : rien à insérer
            const colW = Math.floor(PAGE_W / d.cols.length);
            const tableCells = d.cols.map(col => {
              const imgData = imgR(col.ref);
              const cellChildren = [];
              if(col.titreDocx && col.titre) cellChildren.push(new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: col.titre, font: 'Aptos', size: 20 })] }));
              if(imgData && imgData.src) {
                const bytes = b64ToBytes(imgData.src);
                if(bytes) {
                  const ext = col.ref.split('.').pop().toLowerCase();
                  const imgType = (ext === 'jpg' || ext === 'jpeg') ? 'jpg' : 'png';
                  const docW = Math.min(200, imgData.w);
                  const docH = Math.round(docW / (imgData.w / imgData.h));
                  cellChildren.push(imgWithBorder(bytes, imgType, docW, docH));
                }
              }
              return new docx.TableCell({
                width: { size: colW, type: docx.WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                borders: BORDERS,
                margins: CELL_MARGINS,
                children: cellChildren
              });
            });
            children.push(new docx.Table({ width:{size:PAGE_W,type:docx.WidthType.DXA}, columnWidths:d.cols.map(()=>colW), rows:[new docx.TableRow({children:tableCells})] }));
          } else if(d.type === 'textes') {
            const dCols = d.cols || [];
            const cpr = d.colsPerRow || dCols.length || 1;
            const colW2 = Math.floor(PAGE_W / cpr);
            const makeCell = col => {
              const cellChildren = [];
              cellChildren.push(new Paragraph({ children: [new TextRun({ text: col.titre || '', font: 'Aptos', size: 20, bold: true })] }));
              if(col.soustitre) cellChildren.push(new Paragraph({ children: [new TextRun({ text: col.soustitre, font: 'Aptos', size: 18, italics: true })] }));
              if(col.texte) {
                col.texte.split('\n').forEach(line => { cellChildren.push(mkLine(line, 'Aptos', 20)); });
              }
              if(col.ref) {
                const imgData = imgR(col.ref);
                if(imgData && imgData.src) {
                  const bytes = b64ToBytes(imgData.src);
                  if(bytes) {
                    const ext = col.ref.split('.').pop().toLowerCase();
                    const imgType = (ext === 'jpg' || ext === 'jpeg') ? 'jpg' : 'png';
                    const docW = Math.min(180, imgData.w);
                    const docH = Math.round(docW / (imgData.w / imgData.h));
                    cellChildren.push(imgWithBorder(bytes, imgType, docW, docH));
                  }
                }
              }
              if(col.auteur) {
                cellChildren.push(new Paragraph({ children: [new TextRun({ text: col.auteur, font: 'Aptos', size: 16, italics: true })] }));
              }
              if(col.source) {
                col.source.split('\n').forEach(line => {
                  cellChildren.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Aptos', size: 12, italics: true })] }));
                });
              }
              return new docx.TableCell({
                width: { size: colW2, type: docx.WidthType.DXA },
                verticalAlign: VerticalAlign.TOP,
                borders: BORDERS,
                margins: CELL_MARGINS,
                children: cellChildren
              });
            };
            const docRows = [];
            for(let i=0; i<dCols.length; i+=cpr) {
              docRows.push(new docx.TableRow({ children: dCols.slice(i, i+cpr).map(makeCell) }));
            }
            if(docRows.length) children.push(new docx.Table({ width:{size:PAGE_W,type:docx.WidthType.DXA}, columnWidths:Array(cpr).fill(colW2), rows:docRows }));
          } else {
            children.push(new Paragraph({ children: [new TextRun({ text: '• ' + d.type + ' — ' + (d.ref||''), font: 'Aptos', size: 22 })] }));
          }
          // One empty paragraph between documents
          if(di < docsR.length - 1) {
            children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
          }
        }
      }

      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));

      // Réponse
      if(q.reponse) {
        if(q.reponse === true) {
          children.push(new Paragraph({ children: [new TextRun({ text: '__________', font: 'Aptos', size: 22 })] }));
        } else if(q.reponse.type === 'image') {
          const imgData2 = imgR(q.reponse.ref);
          if(imgData2 && imgData2.src) {
            const bytes_2 = b64ToBytes(imgData2.src);
            if(bytes_2) {
              const ext_2 = q.reponse.ref.split('.').pop().toLowerCase();
              const imgType_2 = (ext_2 === 'jpg' || ext_2 === 'jpeg') ? 'jpg' : 'png';
              const docW_2 = Math.min(400, imgData2.w);
              const docH_2 = Math.round(docW_2 / (imgData2.w / imgData2.h));
              children.push(imgWithBorder(bytes_2, imgType_2, docW_2, docH_2));
            }
          }
        } else if(q.reponse.type === 'tableau_3col') {
          const {col1='', col2='', col3=''} = q.reponse;
          const col2W = PAGE_W - COL_2CM * 2;
          const mkHdr3 = (w) => (t) => new TableCell({ borders:BORDERS, margins:CELL_MARGINS, verticalAlign:VerticalAlign.CENTER,
            width:{size:w, type:WidthType.DXA},
            children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:t,font:'Aptos',size:20,bold:true})]})] });
          const mkBlank3 = (w) => new TableCell({ borders:BORDERS, margins:CELL_MARGINS,
            width:{size:w, type:WidthType.DXA},
            children:[new Paragraph({children:[new TextRun({text:' '})]})] });
          children.push(new Table({ width:{size:PAGE_W, type:WidthType.DXA}, columnWidths:[COL_2CM, col2W, COL_2CM], rows:[
            new TableRow({ height:{value:284,rule:'atLeast'}, children:[
              mkHdr3(COL_2CM)(col1),
              new TableCell({ borders:BORDERS, margins:CELL_MARGINS, verticalAlign:VerticalAlign.CENTER, rowSpan:2,
                width:{size:col2W, type:WidthType.DXA},
                children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:col2,font:'Aptos',size:20,bold:true})]})] }),
              mkHdr3(COL_2CM)(col3)
            ]}),
            new TableRow({ height:{value:284,rule:'atLeast'}, children:[mkBlank3(COL_2CM), mkBlank3(COL_2CM)] })
          ]}));
        } else if(q.reponse.type === 'lignes') {
          const BN_L = { style: docx.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
          const BB_L = { style: docx.BorderStyle.SINGLE, size: 6, color: '000000' };
          const MP_L = { spacing:{before:0,after:0}, children:[new TextRun({text:' '})] };
          const MC_L = { top:0, bottom:0, left:0, right:0 };
          const nb = q.reponse.nombre;
          const mkRow = (first) => new docx.TableRow({
            height:{value:500,rule:'exact'},
            children:[new docx.TableCell({
              borders:{top:(first && nb>1)?BB_L:BN_L, bottom:BB_L, left:BN_L, right:BN_L},
              margins:MC_L,
              children:[new Paragraph(MP_L)]
            })]
          });
          const ligneRows = [];
          for(let i=0; i<nb; i++) ligneRows.push(mkRow(i===0));
          if(ligneRows.length === 0) ligneRows.push(mkRow(true));
          children.push(new docx.Table({
            width:{size:PAGE_W,type:docx.WidthType.DXA},
            columnWidths:[PAGE_W],
            borders:{top:BN_L,bottom:BN_L,left:BN_L,right:BN_L,insideH:BN_L,insideV:BN_L},
            rows:ligneRows
          }));
          children.push(new Paragraph({ children:[new TextRun({text:''})] }));
        } else if(q.reponse.type === 'tableau') {
          const repRows = [
            new TableRow({ children: [
              new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ children: [new TextRun({ text: '', font: 'Aptos', size: 20, bold: true })] })] }),
              new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Document', font: 'Aptos', size: 20, bold: true })] })] })
            ]})
          ];
          (q.reponse.lignes||[]).forEach(l => {
            repRows.push(new TableRow({ children: [
              new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ children: [new TextRun({ text: l.label, font: 'Aptos', size: 20 })] })] }),
              new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ children: [new TextRun({ text: '', font: 'Aptos', size: 20 })] })] })
            ]}));
          });
          children.push(new Table({ width: { size: 0, type: WidthType.AUTO }, rows: repRows }));
        } else if(q.reponse.type === 'grille') {
          const {entetes=[], rangees=[]} = q.reponse;
          // Grille sans contenu (données incomplètes) : ne rien insérer plutôt qu'une
          // table à 0 colonne qui corromprait le document Word.
          if(entetes.length || rangees.length) {
            const nCols = entetes.length || rangees[0]?.length || 1;
            const gColW = Math.floor(PAGE_W / nCols);
            const mkGCell = (text, bold) => new TableCell({
              borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: [new TextRun({ text: String(text||''), font:'Aptos', size:20, bold:!!bold })] })]
            });
            const gRows = [
              ...(entetes.length ? [new TableRow({ children: entetes.map(h => mkGCell(h, true)) })] : []),
              ...rangees.map(row => new TableRow({ children: (row||[]).map((cell, ci) => mkGCell(cell, ci===0)) }))
            ];
            children.push(new Table({ width:{size:PAGE_W, type:WidthType.DXA}, columnWidths:Array(nCols).fill(gColW), rows:gRows }));
          }
        } else if(q.reponse.type === 'cause-consequence') {
          const CIRC_CC = 450000;
          const mkCCLbl = (text) => new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: 'Aptos', size: 20, bold: true })] })] });
          const mkCCCirc = () => { const p = new Paragraph({ alignment: AlignmentType.CENTER, spacing:{before:80,after:80}, children:[] }); p.root.push(new EllipseRun(CIRC_CC, CIRC_CC)); return new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width:{size:COL_2CM*2,type:WidthType.DXA}, children:[p] }); };
          children.push(new Table({ width: { size: 0, type: WidthType.AUTO }, rows: [
            new TableRow({ height:{value:800,rule:'atLeast'}, children:[mkCCLbl('Cause'),       mkCCCirc()] }),
            new TableRow({ height:{value:800,rule:'atLeast'}, children:[mkCCLbl('Conséquence'), mkCCCirc()] }),
          ]}));
        } else if(q.reponse.type === 'tableau_2col') {
          const c2 = 1701; // 3 cm in DXA
          const mk2 = (t, bold=false) => new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
            width: { size: c2, type: WidthType.DXA },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, font: 'Aptos', size: 20, bold })] })] });
          children.push(new Table({ width: { size: c2 * 2, type: WidthType.DXA }, columnWidths: [c2, c2], rows: [
            new TableRow({ children: [mk2('Réponse', true), mk2('')] })
          ]}));
        } else if(q.reponse.type === 'mettre-en-relation' && (q.reponse.elements||[]).length) {
          const CIRC_MER = 450000; // 1.25cm
          const els = q.reponse.elements || [];
          const n = els.length || 2;
          const colW_mer = Math.floor(PAGE_W / n);
          const colWidths_mer = Array(n).fill(0).map((_, i) => i === n - 1 ? PAGE_W - colW_mer * (n - 1) : colW_mer);
          const mkLblCell = (text, w) => new TableCell({
            borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
            width: { size: w, type: WidthType.DXA },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: 'Aptos', size: 20, bold: true })] })]
          });
          const mkMerCircCell = (w) => {
            const para = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [] });
            para.root.push(new EllipseRun(CIRC_MER, CIRC_MER));
            return new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width: { size: w, type: WidthType.DXA }, children: [para] });
          };
          if(n === 2 && q.reponse.double) {
            // Vertical layout: [label | ○ | et | ○], col3 sans bordures gauche/droite
            const BNN = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
            const mkCircNR = (w) => { const p = new Paragraph({ alignment: AlignmentType.CENTER, spacing:{before:80,after:80}, children:[] }); p.root.push(new EllipseRun(CIRC_MER,CIRC_MER)); return new TableCell({ borders:{top:BORDER,bottom:BORDER,left:BORDER,right:BNN}, margins:CELL_MARGINS, verticalAlign:VerticalAlign.CENTER, width:{size:w,type:WidthType.DXA}, children:[p] }); };
            const mkCircNL = (w) => { const p = new Paragraph({ alignment: AlignmentType.CENTER, spacing:{before:80,after:80}, children:[] }); p.root.push(new EllipseRun(CIRC_MER,CIRC_MER)); return new TableCell({ borders:{top:BORDER,bottom:BORDER,left:BNN,right:BORDER}, margins:CELL_MARGINS, verticalAlign:VerticalAlign.CENTER, width:{size:w,type:WidthType.DXA}, children:[p] }); };
            const mkEtMer = () => new TableCell({ borders:{top:BORDER,bottom:BORDER,left:BNN,right:BNN}, margins:CELL_MARGINS, verticalAlign:VerticalAlign.CENTER, children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:'et',font:'Aptos',size:20})]})] });
            children.push(new Table({ width: { size: 0, type: WidthType.AUTO }, rows: els.map(e =>
              new TableRow({ height: { value: 800, rule: 'atLeast' }, children: [mkLblCell(e, 0), mkCircNR(COL_2CM * 2), mkEtMer(), mkCircNL(COL_2CM * 2)] })
            )}));
          } else if(n === 2) {
            // Vertical layout: auto-width to content
            children.push(new Table({ width: { size: 0, type: WidthType.AUTO }, rows: els.map(e =>
              new TableRow({ height: { value: 800, rule: 'atLeast' }, children: [mkLblCell(e, 0), mkMerCircCell(COL_2CM * 2)] })
            )}));
          } else {
            // Horizontal layout: row 1 labels, row 2 circles
            children.push(new Table({ width: { size: PAGE_W, type: WidthType.DXA }, columnWidths: colWidths_mer, rows: [
              new TableRow({ children: els.map((e, i) => mkLblCell(e, colWidths_mer[i])) }),
              new TableRow({ height: { value: 800, rule: 'atLeast' }, children: colWidths_mer.map(w => mkMerCircCell(w)) })
            ]}));
          }
        } else if(q.reponse.type === 'situer-dans-lespace') {
          // 2 colonnes : row 1 = labels, row 2 = cercles (comme MER horizontal n=2)
          const CIRC_SDE = 450000; // 1.25cm
          const elsS = (q.reponse.elements||[]).length ? q.reponse.elements : ['Élément 1','Élément 2'];
          const mkSdeLbl = (text) => new TableCell({
            borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: 'Aptos', size: 20, bold: true })] })]
          });
          const mkSdeCirc = () => {
            const para = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [] });
            para.root.push(new EllipseRun(CIRC_SDE, CIRC_SDE));
            return new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, children: [para] });
          };
          children.push(new Table({ width: { size: 0, type: WidthType.AUTO }, rows: [
            new TableRow({ children: elsS.map(e => mkSdeLbl(e)) }),
            new TableRow({ height: { value: 800, rule: 'atLeast' }, children: elsS.map(() => mkSdeCirc()) })
          ]}));
        } else if(q.reponse.type === 'avant-apres') {
          // 7 colonnes : [○][et][○] | événement | [○][et][○]
          // Cercles = formes DrawingML ellipse 2cm×2cm (720000 EMU)
          const CIRC_EMU = 720000; // 2cm
          const cMid  = Math.floor(PAGE_W * 0.38);
          const cSide = Math.floor((PAGE_W - cMid) / 2);
          const etW   = 680;
          const cCirc = Math.floor((cSide - etW) / 2);
          const cCircL= cSide - etW - cCirc;
          const BNN   = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
          const mkCircCell = (w, bl, br) => {
            const para = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [] });
            para.root.push(new EllipseRun(CIRC_EMU, CIRC_EMU));
            return new TableCell({ borders: { top: BORDER, bottom: BORDER, left: bl, right: br }, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width: { size: w, type: WidthType.DXA }, children: [para] });
          };
          const mkEtCell = (w) => new TableCell({ borders: { top: BORDER, bottom: BORDER, left: BNN, right: BNN }, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width: { size: w, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'et', font: 'Aptos', size: 20, bold: true })] })] });
          const mkHdrAA = (text, cs, w) => new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, columnSpan: cs > 1 ? cs : undefined, width: { size: w, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: 'Aptos', size: 20, bold: true })] })] });
          children.push(new Table({ width: { size: PAGE_W, type: WidthType.DXA }, columnWidths: [cCirc, etW, cCircL, cMid, cCirc, etW, cCircL], rows: [
            new TableRow({ children: [
              mkHdrAA('Avant', 3, cSide),
              new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, rowSpan: 2, width: { size: cMid, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: q.reponse.label || '', font: 'Aptos', size: 20, bold: true })] })] }),
              mkHdrAA('Après', 3, cSide),
            ]}),
            new TableRow({ height: { value: 1300, rule: 'atLeast' }, children: [
              mkCircCell(cCirc,  BORDER, BNN),
              mkEtCell(etW),
              mkCircCell(cCircL, BNN, BORDER),
              mkCircCell(cCirc,  BORDER, BNN),
              mkEtCell(etW),
              mkCircCell(cCircL, BNN, BORDER),
            ]}),
          ]}));
        }
        children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      }

      // Réglette
      buildReglette(id).forEach(t => children.push(t));

      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
    });

    // Commentaires à la fin du cahier
    if(!includeGuide && !!document.getElementById('exam-commentaires')?.checked) {
      children.push(new Paragraph({ children: [new TextRun({ text:'' })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: 'Commentaires :', font:'Aptos', size:20, bold:true })] }));
      const BN = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
      const BL = { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' };
      const mkCommRow = () => new TableRow({ children: [new TableCell({
        width: { size: PAGE_W, type: WidthType.DXA },
        borders: { top: BN, bottom: BL, left: BN, right: BN },
        margins: { top: 180, bottom: 0, left: 0, right: 0 },
        children: [new Paragraph({ children: [new TextRun({ text: '', font:'Aptos', size:22 })] })]
      })] });
      children.push(new Table({
        width: { size: PAGE_W, type: WidthType.DXA },
        columnWidths: [PAGE_W],
        rows: [mkCommRow(), mkCommRow(), mkCommRow()]
      }));
    }

    } // end else (cahier mode)

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children
      }]
    });

    const buffer = await Packer.toBlob(doc);
    const url = URL.createObjectURL(buffer);
    const a = document.createElement('a');
    a.href = url;
    a.download = includeGuide ? 'cahier_GHEC_guide.docx' : 'cahier_GHEC.docx';
    a.click();
    URL.revokeObjectURL(url);

    if(btn) btn.textContent = '✓ Téléchargé !';
    setTimeout(() => {
      if(btn) { btn.textContent = includeGuide ? '⬇ Guide' : '⬇ Cahier'; btn.disabled = false; }
      if(btnOther) btnOther.disabled = false;
    }, 2500);
  } catch(e) {
    console.error(e);
    showWarn('Erreur : ' + e.message);
    if(btn) { btn.textContent = includeGuide ? '⬇ Guide' : '⬇ Cahier'; btn.disabled = false; }
    if(btnOther) btnOther.disabled = false;
  }
}

// ===== MODE EXAMEN =====
let examIdx = 0;

async function openExam() {
  if(!panier.length) { showWarn('Le cahier est vide.'); return; }
  await ensureDataLoaded(); // sinon q.documents/q.reponse sont undefined si le panier a été rempli sans jamais ouvrir de modal/aperçu
  examIdx = 0;
  closeCahier();
  renderExam();
  const ov = document.getElementById('exam-overlay');
  ov.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  ov.focus();
}

function closeExam() {
  document.getElementById('exam-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function examNav(dir) {
  examIdx = Math.max(0, Math.min(panier.length - 1, examIdx + dir));
  renderExam();
}

function renderExam() {
  _tzStore.length = 0; // reset pour éviter l'accumulation à chaque navigation
  const total = panier.length;
  const q = Q_MAP.get(panier[examIdx]);
  if(!q) return;
  const { oi } = q;
  const s = oiStyle(oi);

  document.getElementById('exam-progress').textContent = `${examIdx + 1} / ${total}`;
  document.getElementById('exam-pts').textContent = `${q.points} pt${q.points > 1 ? 's' : ''}`;
  document.getElementById('exam-prev').disabled = examIdx === 0;
  document.getElementById('exam-next').disabled = examIdx === total - 1;

  // Dots
  const dotsEl = document.getElementById('exam-dots');
  dotsEl.innerHTML = panier.map((id, i) => {
    const cls = i === examIdx ? 'exam-dot active' : 'exam-dot';
    return `<span class="${cls}" onclick="examIdx=${i};renderExam()" title="${i+1}"></span>`;
  }).join('');

  // Corps
  const soustag = q.soustag ? `<span class="exam-meta">${escLine(q.soustag)}</span>` : '';
  const periode = q.periode ? `<span class="exam-meta">${escLine(q.periode)}</span>` : '';
  const docs = (q.documents || []).map(d => renderDoc(d, true)).join('');
  const rep  = renderReponse(q);

  document.getElementById('exam-body').innerHTML = `
    <div class="exam-oi-badge" style="background:${s.bg};color:${s.color}">${escLine(oi)}</div>
    <div class="exam-meta-row">${periode}${soustag}</div>
    <div class="exam-enonce">${formatTexte(q.enonce)}</div>
    <div class="exam-docs">${docs}</div>
    <div class="exam-reponse">${rep}</div>
  `;
}
