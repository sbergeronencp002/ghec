// ─────────────────────────────────────────────────────────────────────
// Cascade de filtres partagée : niveau → période → aspect.
//
// Chargée par index.html (app.js) ET revision.html : les deux pages ont la
// même hiérarchie de filtres. Ce code vivait dupliqué dans chaque page ;
// il vit désormais ici uniquement (même principe que questions-io.js pour
// le sérialiseur). L'application des filtres et le rendu des résultats
// restent propres à chaque page (tri et affichage différents).
//
// Ne dépend que du DOM (ids de <select> passés en paramètre) et de
// PERIODES_PAR_NIVEAU (contexte.js), passé en paramètre lui aussi.
// ─────────────────────────────────────────────────────────────────────

function fillSelect(id, vals, placeholder) {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${placeholder}</option>`;
  vals.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; el.appendChild(o); });
}

// Construit le libellé d'une combinaison de 2 sociétés. Aucun nom de société n'est codé
// en dur (générique, comme tout le reste du fichier) : on tente juste de repérer un motif
// "<partie commune> vers <année>" partagé par convention dans ce programme, pour fusionner
// la partie identique plutôt que de la répéter deux fois. Même société à 2 époques (ex.
// « Interpréter le changement ») → "Ethnonyme vers 1500 et 1745". Deux sociétés à la même
// époque (ex. « S'ouvrir à la diversité ») → "Ethnonyme1 et Ethnonyme2 vers 1500". Si le nom
// ne suit pas ce motif (autre programme, autre convention), repli sur "A et B".
function comboLabel(a, b) {
  const m = /^(.+?)\s+vers\s+(.+)$/;
  const ma = a.match(m), mb = b.match(m);
  if (ma && mb) {
    if (ma[1] === mb[1]) return `${ma[1]} vers ${ma[2]} et ${mb[2]}`;
    if (ma[2] === mb[2]) return `${ma[1]} et ${mb[1]} vers ${ma[2]}`;
  }
  return `${a} et ${b}`;
}

// Calcule les combinaisons de 2 sociétés qui apparaissent ENSEMBLE dans au moins une
// question de comparaison (q.periodes de longueur 2) parmi `allowedPeriodes` (le niveau
// courant, ou periodeOrder si aucun niveau choisi) — jamais une combinaison sans question
// réelle. `allowedPeriodes` fixe aussi l'ordre canonique d'affichage de la paire (cohérent
// quel que soit l'ordre saisi dans le formulaire de la question).
function computePeriodeCombos(questions, allowedPeriodes) {
  const allowedSet = new Set(allowedPeriodes);
  const seen = new Map();
  questions.forEach(q => {
    const per = q.periodes || [];
    if (per.length !== 2 || !allowedSet.has(per[0]) || !allowedSet.has(per[1])) return;
    const ids = allowedPeriodes.filter(p => per.includes(p));
    if (ids.length !== 2) return;
    const key = ids.join('|||');
    if (!seen.has(key)) seen.set(key, { ids, label: comboLabel(ids[0], ids[1]) });
  });
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

// Peuple le <select> Société : sociétés simples et combinaisons de comparaison (voir
// computePeriodeCombos) toutes en options directes à plat, sans regroupement visuel
// (pas d'<optgroup> — celui-ci indenterait les combinaisons et afficherait un label
// « Comparaisons » non désiré). Valeur d'une combinaison : "combo:" + JSON de la paire
// (voir matchesPeriodeFilter) — un préfixe explicite, jamais ambigu avec un nom de
// société réel.
function fillPeriodeSelect(id, periodes, combos, placeholder) {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${placeholder}</option>`;
  periodes.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; el.appendChild(o); });
  combos.forEach(c => {
    const o = document.createElement('option');
    o.value = 'combo:' + JSON.stringify(c.ids);
    o.textContent = c.label;
    el.appendChild(o);
  });
}

// Teste si une question correspond à la valeur courante du <select> Société — soit une
// combinaison "combo:[...]" (voir fillPeriodeSelect) : q.periodes doit être EXACTEMENT
// cette paire — soit une société simple : q.periodes doit être EXACTEMENT cette société
// seule (une seule entrée, celle-ci). Une question de comparaison impliquant cette société
// n'apparaît donc plus ici : elle n'est accessible que via sa combinaison dédiée, pour que
// les deux catégories (société simple / comparaison) restent des vues disjointes plutôt
// que redondantes.
function matchesPeriodeFilter(q, periodeValue) {
  if (!periodeValue) return true;
  const per = q.periodes || [];
  if (periodeValue.startsWith('combo:')) {
    let pair;
    try { pair = JSON.parse(periodeValue.slice(6)); } catch (e) { return false; }
    return per.length === pair.length && pair.every(p => per.includes(p));
  }
  return per.length === 1 && per[0] === periodeValue;
}

function fillAspectSelect(id, aspects, periodeOrder) {
  const el = document.getElementById(id);
  el.innerHTML = '<option value="">Tous</option>';
  periodeOrder.forEach(p => {
    const group = aspects.filter(a => a.periode === p);
    if(!group.length) return;
    const og = document.createElement('optgroup');
    og.label = p;
    group.forEach(a => {
      const o = document.createElement('option');
      o.value = a.aspect; o.textContent = a.aspect;
      og.appendChild(o);
    });
    el.appendChild(og);
  });
}

// Reconstruit le <select> Période selon le niveau choisi (en conservant la
// période courante si elle reste valide), puis le <select> Aspect en cascade.
// ids = { niveau, periode, aspect } (ids des <select> correspondants).
// `questions` = QUESTIONS (ou équivalent) — sert à calculer les combinaisons de
// comparaison disponibles pour ce niveau (voir computePeriodeCombos).
function cascadeNiveauChange(ids, aspects, periodeOrder, PERIODES_PAR_NIVEAU, questions) {
  const niveau = document.getElementById(ids.niveau).value;
  const allowedPeriodes = niveau ? PERIODES_PAR_NIVEAU[niveau] : periodeOrder;

  const periodeEl = document.getElementById(ids.periode);
  const currentPeriode = periodeEl.value;
  const combos = computePeriodeCombos(questions, allowedPeriodes);
  fillPeriodeSelect(ids.periode, allowedPeriodes, combos, 'Toutes');
  const validValues = new Set([...allowedPeriodes, ...combos.map(c => 'combo:' + JSON.stringify(c.ids))]);
  periodeEl.value = validValues.has(currentPeriode) ? currentPeriode : '';

  cascadePeriodeChange(ids, aspects, periodeOrder, PERIODES_PAR_NIVEAU, questions);
}

// Reconstruit le <select> Aspect selon le niveau + la société (simple ou combinaison)
// choisie. Pour une combinaison, l'aspect peut appartenir à l'une ou l'autre des 2
// sociétés (une question de comparaison peut être classée sous l'aspect de n'importe
// laquelle des deux).
function cascadePeriodeChange(ids, aspects, periodeOrder, PERIODES_PAR_NIVEAU, questions) {
  const niveau  = document.getElementById(ids.niveau).value;
  const periode = document.getElementById(ids.periode).value;
  const allowedPeriodes = niveau ? PERIODES_PAR_NIVEAU[niveau] : periodeOrder;
  let filteredAspects;
  if (periode.startsWith('combo:')) {
    let pair = [];
    try { pair = JSON.parse(periode.slice(6)); } catch (e) {}
    filteredAspects = aspects.filter(a => pair.includes(a.periode));
  } else if (periode) {
    filteredAspects = aspects.filter(a => a.periode === periode);
  } else {
    filteredAspects = aspects.filter(a => allowedPeriodes.includes(a.periode));
  }
  fillAspectSelect(ids.aspect, filteredAspects, periodeOrder);
  document.getElementById(ids.aspect).value = '';
}
