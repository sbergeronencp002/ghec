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
function cascadeNiveauChange(ids, aspects, periodeOrder, PERIODES_PAR_NIVEAU) {
  const niveau = document.getElementById(ids.niveau).value;
  const allowedPeriodes = niveau ? PERIODES_PAR_NIVEAU[niveau] : periodeOrder;

  const periodeEl = document.getElementById(ids.periode);
  const currentPeriode = periodeEl.value;
  periodeEl.innerHTML = '<option value="">Toutes</option>';
  allowedPeriodes.forEach(p => {
    const o = document.createElement('option');
    o.value = o.textContent = p;
    periodeEl.appendChild(o);
  });
  periodeEl.value = allowedPeriodes.includes(currentPeriode) ? currentPeriode : '';

  cascadePeriodeChange(ids, aspects, periodeOrder, PERIODES_PAR_NIVEAU);
}

// Reconstruit le <select> Aspect selon le niveau + la période choisis.
function cascadePeriodeChange(ids, aspects, periodeOrder, PERIODES_PAR_NIVEAU) {
  const niveau  = document.getElementById(ids.niveau).value;
  const periode = document.getElementById(ids.periode).value;
  const allowedPeriodes = niveau ? PERIODES_PAR_NIVEAU[niveau] : periodeOrder;
  const filteredAspects = periode
    ? aspects.filter(a => a.periode === periode)
    : aspects.filter(a => allowedPeriodes.includes(a.periode));
  fillAspectSelect(ids.aspect, filteredAspects, periodeOrder);
  document.getElementById(ids.aspect).value = '';
}
