// ─────────────────────────────────────────────────────────────────────────────
// Générateur d'examens — algorithme de sélection + numérotation des documents.
// Fonctions pures (aucune dépendance au DOM) : chargé par examen.html, et
// testable directement via node (voir tools/test-examen-gen.mjs).
//
// Contraintes de sélection (pour une période donnée) :
//   - chaque aspect du programme (ASPECTS_PAR_PERIODE) est couvert par exactement une
//     question dédiée, jamais deux fois, jamais partagée avec un autre aspect (une
//     question à aspects multiples ne peut être retenue que pour un seul d'entre eux :
//     le nombre de questions finales est donc toujours égal au nombre d'aspects) — SAUF
//     exception rare et forcée par le contenu : si un aspect n'a AUCUN candidat qui lui
//     soit dédié exclusivement, il est fusionné avec l'aspect qu'il partage avec ses seuls
//     candidats (voir exBuildAspectSlots, ex. P3 : « Église catholique ») — une question
//     couvre alors les deux à la fois, et le nombre de questions descend d'autant ;
//   - total des points ≤ maxPoints ;
//   - les 8 OI sont toutes représentées au moins une fois (variété), réduit aux OI
//     réellement atteignables dans la période (voir effectiveOiList dans exGenererExamen —
//     ex. P1, la toute première période, n'a aucune question « Déterminer des changements
//     et des continuités ») ;
//   - jamais deux questions de la même OI avec le même sous-tag (soustag) — si une OI
//     revient plusieurs fois, chaque occurrence doit couvrir un sous-type différent ;
//   - certaines OI ont un plafond dur, indépendant de l'OI favorite (voir EX_OI_HARD_CAP,
//     assoupli pour un favori précis via EX_OI_HARD_CAP_RELAX) ;
//   - l'OI « favorite » choisie par l'enseignant apparaît un nombre de fois exact
//     (voir EX_FAVORI_BASE_TARGET), pas juste « au moins une fois de plus » ;
//   - jamais deux questions consécutives de la même OI dans l'ordre final de l'examen.
// ─────────────────────────────────────────────────────────────────────────────

const EX_ATTEMPTS_PER_LEVEL = 150;

// Nombre de questions visé pour chaque OI sélectionnable comme favorite — certaines OI
// se prêtent à davantage de répétitions (sous-tags plus nombreux) que d'autres.
// Vide au départ pour GHEC (aucune OI n'a encore été configurée) : toute OI favorite
// retombe sur la valeur par défaut (2, voir exFavoriTargetLevels) tant qu'aucune entrée
// n'est ajoutée ici — à ajuster une fois les OI et leurs sous-tags réels connus.
const EX_FAVORI_BASE_TARGET = {
};

// Paliers de la cible pour l'OI favorite, du plus ambitieux au plus permissif : si le
// nombre exact n'est pas atteignable (budget de points, sous-tags disponibles…) en
// EX_ATTEMPTS_PER_LEVEL essais, on redescend d'un cran plutôt que d'échouer — mieux vaut
// un favori plus modeste qu'aucun examen valide. 0 = pas de ciblage particulier (l'OI
// reste garantie au moins une fois par la règle de variété générale).
function exFavoriTargetLevels(favoriOi) {
  const base = EX_FAVORI_BASE_TARGET[favoriOi] != null ? EX_FAVORI_BASE_TARGET[favoriOi] : 2;
  const levels = [];
  for (let t = base; t >= 0; t--) levels.push(t);
  return levels;
}

// Plafond dur du nombre d'occurrences pour certaines OI, indépendant de l'OI favorite —
// certains types de questions ne doivent jamais apparaître plus de N fois dans un même
// examen.
// Vide au départ pour GHEC : aucune OI n'a de plafond dur tant que rien n'est ajouté
// ici (repli sur Infinity, voir exEffectiveHardCap) — à ajuster une fois le programme
// et ses OI réels configurés, si certains types de questions ne doivent pas se répéter
// au-delà de N fois dans un même examen.
const EX_OI_HARD_CAP = {
};

// Assouplissement de plafond scopé STRICTEMENT à un favori précis — jamais un relâchement
// global du plafond. Vide au départ pour GHEC ; à peupler seulement si une combinaison
// (OI favorite, budget de points, plafonds) s'avère mathématiquement inatteignable, sur
// le modèle : { '<OI favorite>': { '<OI à assouplir>': <nouveau plafond> } }.
const EX_OI_HARD_CAP_RELAX = {
};

function exEffectiveHardCap(oi, favoriOi) {
  const relax = EX_OI_HARD_CAP_RELAX[favoriOi];
  if (relax && relax[oi] != null) return relax[oi];
  return EX_OI_HARD_CAP[oi];
}

// OI dont le nombre d'occurrences est fixé une fois pour toutes (pas juste un plafond,
// une cible exacte), indépendamment de l'OI favorite choisie par l'enseignant. Reste
// active par défaut, mais peut dégrader (voir exFixedTargetLevels) si elle entre en
// conflit de budget avec la cible de l'OI favorite — l'OI favorite est le choix explicite
// de l'enseignant pour CET examen, elle passe donc avant cette préférence de fond.
// Vide au départ pour GHEC — voir exOiCap/exGenererExamen : aucune OI n'a de cible
// exacte fixée tant que rien n'est ajouté ici. Format : { '<OI>': <cible exacte> }.
const EX_OI_FIXED_TARGET = {};

// Cibles exactes par OI propres à une période précise, EN PLUS de EX_OI_FIXED_TARGET
// (fusionnées dans exGenererExamen). Cas d'usage : une période trop courte pour la variété
// générale habituelle (voir EX_OI_VARIETY_EXCLUDE_BY_PERIODE) où l'enseignant préfère une
// distribution d'OI précise à la place. Vide au départ pour GHEC — format :
// { '<période>': { '<OI>': <cible exacte> } }.
const EX_OI_FIXED_TARGET_BY_PERIODE = {
};

// OI à exclure de l'exigence de variété générale pour une période précise. Vide au départ
// pour GHEC — format : { '<période>': ['<OI>', ...] }.
const EX_OI_VARIETY_EXCLUDE_BY_PERIODE = {
};

// Aspects pouvant être couverts par PLUSIEURS questions distinctes (au lieu d'une seule),
// quand le contenu de cet aspect précis a assez d'OI/sous-tags différents pour le
// supporter. Absent de la config = comportement par défaut (1 question par aspect, comme
// partout ailleurs). Vide au départ pour GHEC — format :
// { '<période>': { '<aspect>': <nombre d'occurrences> } }.
const EX_ASPECT_REPEAT_BY_PERIODE = {
};

// Scénarios propres à une période ET à l'OI favorite choisie par l'enseignant : ajustent
// la distribution de base (cibles fixes et/ou nombre de slots) pour cette combinaison
// précise, essayés AVANT la dégradation générique habituelle. Vide au départ pour GHEC :
// le générateur repose entièrement sur le repli générique (variété + budget de points)
// tant qu'aucun scénario n'est ajouté ici — voir le format détaillé dans les commentaires
// du dépôt hqccssbf d'origine si des scénarios similaires sont nécessaires un jour.
const EX_FAVORI_SCENARIOS_BY_PERIODE = {
};

// Paliers de dégradation des cibles fixes, du plus ambitieux (valeurs de `targetMap`
// telles quelles) au plus permissif (1 pour chacune — en dessous, la variété générale
// garantit déjà au moins une occurrence, donc 1 est le plancher utile).
function exFixedTargetLevels(targetMap) {
  const keys = Object.keys(targetMap);
  if (!keys.length) return [{}];
  const maxTarget = Math.max(...keys.map(k => targetMap[k]));
  const levels = [];
  for (let t = maxTarget; t >= 1; t--) {
    const level = {};
    keys.forEach(k => { level[k] = Math.min(targetMap[k], t); });
    levels.push(level);
  }
  return levels;
}

// Répartition cible du nombre de questions par OI : 1 de base pour chacune (garantit la
// variété), les cibles fixes (`fixedTargets`), et exactement `favoriTarget` pour l'OI
// favorite si celle-ci dépasse 1.
function exComputeOiQuota(oiList, favoriOi, favoriTarget, fixedTargets) {
  const quota = {};
  oiList.forEach(oi => { quota[oi] = 1; });
  Object.keys(fixedTargets).forEach(oi => { quota[oi] = fixedTargets[oi]; });
  if (favoriOi && oiList.includes(favoriOi) && favoriTarget > 1) {
    quota[favoriOi] = favoriTarget;
  }
  return quota;
}

// Plafond effectif pour une OI donnée dans cette tentative : sa cible fixe (`fixedTargets`)
// et/ou la cible de l'OI favorite (si `oi` est l'OI favorite) priment sur EX_OI_HARD_CAP,
// même si celui-ci est normalement plus bas pour cette OI. Quand une OI a À LA FOIS une
// cible fixe ET est la favorite, la plus grande des deux prime — le choix explicite de
// l'enseignant doit pouvoir dépasser une préférence de fond, jamais l'inverse. Sinon,
// repli sur EX_OI_HARD_CAP (assoupli via EX_OI_HARD_CAP_RELAX si applicable à ce favori).
function exOiCap(oi, favoriOi, favoriTarget, fixedTargets) {
  const fixed = fixedTargets[oi];
  const favori = (oi === favoriOi && favoriTarget > 0) ? favoriTarget : null;
  if (fixed != null || favori != null) return Math.max(fixed || 0, favori || 0);
  const hard = exEffectiveHardCap(oi, favoriOi);
  return hard != null ? hard : Infinity;
}

function exShuffle(arr, rng) {
  const rand = rng || Math.random;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Estime la « richesse documentaire » d'une question (nombre/qualité des
// documents), utilisée pour préférer les questions à documents substantiels
// lors de la sélection (maximiser l'espace du dossier documentaire).
function exDocRichness(q) {
  let score = 0;
  (q.documents || []).forEach(d => {
    (d.cols || [d]).forEach(col => {
      if (col.ref) score += 3;
      if (col.texte) score += Math.min(3, col.texte.length / 120);
    });
  });
  return score;
}

function exAspectsOf(q) {
  return (q.aspects || []).map(x => x.aspect);
}

// Clé de diversité au sein d'une même OI (jamais deux fois la même pour une OI donnée) :
// le sous-tag par défaut. Si une OI du programme GHEC n'a pas toujours de sous-tag mais
// qu'un autre critère de diversité est dérivable directement de la question (comme le
// nombre de documents pour une OI de mise en relation, voir l'exemple équivalent dans le
// dépôt hqccssbf), ajouter un cas spécial ici sur le même modèle.
function exDiversityKey(q) {
  return q.soustag || '';
}

// Regroupe les aspects du programme qui doivent être couverts ENSEMBLE par une seule
// question, dans le cas — exceptionnel — où un aspect n'a AUCUN candidat qui lui soit
// dédié exclusivement (tous ses candidats partagent aussi un autre aspect du programme).
// Ex. P3 : « Église catholique » n'a que 3 questions, toutes aussi taguées « Église
// anglicane » — impossible de respecter « un aspect, une question » pour ce cas précis,
// donc on fusionne les deux en un seul « slot » qui sera couvert par une seule question
// (choisie parmi les 3, selon les critères habituels). Union-find : chaque aspect sans
// candidat dédié est fusionné avec tous les aspects que touchent SES candidats — le
// nombre de questions final descend d'autant que d'aspects fusionnés (1 par groupe au
// lieu d'1 par aspect). N'affecte aucun aspect qui a par ailleurs un candidat dédié.
function exBuildAspectSlots(pool, aspects, aspectRepeat, aspectPin) {
  const repeat = aspectRepeat || {};
  const pin = aspectPin || {};
  const parent = new Map(aspects.map(a => [a, a]));
  function find(a) { let r = a; while (parent.get(r) !== r) r = parent.get(r); return r; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }

  const hasDedicated = new Set();
  pool.forEach(q => {
    const qa = exAspectsOf(q).filter(a => aspects.includes(a));
    if (qa.length === 1) hasDedicated.add(qa[0]);
  });

  aspects.forEach(a => {
    if (hasDedicated.has(a)) return;
    pool.forEach(q => {
      const qa = exAspectsOf(q).filter(a2 => aspects.includes(a2));
      if (qa.includes(a)) qa.forEach(other => union(a, other));
    });
  });

  const groups = new Map();
  aspects.forEach(a => {
    const root = find(a);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(a);
  });

  const slots = [];
  groups.forEach(list => {
    const key = list.slice().sort().join(' + ');
    // Une répétition n'est permise que sur un aspect seul (pas un groupe déjà fusionné) —
    // chaque instance devient un slot distinct exigeant sa propre question. La 1ʳᵉ instance
    // reste toujours libre (n'importe quelle OI) ; `pin[aspect]` (si présent) épingle les
    // instances SUPPLÉMENTAIRES (2ᵉ et suivantes) à une OI précise — voir `pinnedOi` dans
    // exTryBuild, qui restreint alors ce slot aux seuls candidats de cette OI.
    const n = (list.length === 1 && repeat[list[0]]) ? repeat[list[0]] : 1;
    const pinnedOi = list.length === 1 ? pin[list[0]] : null;
    for (let i = 1; i <= n; i++) {
      const slot = { key: n > 1 ? key + ' #' + i : key, aspects: list };
      if (i > 1 && pinnedOi) slot.pinnedOi = pinnedOi;
      slots.push(slot);
    }
  });
  return slots;
}

// Coût minimal (en points) pour couvrir chaque slot, tous candidats confondus.
// Utilisé pour vérifier qu'il reste assez de budget de points pour couvrir
// les slots encore non traités avant de valider un choix.
function exMinCostBySlot(bySlot) {
  const minCost = {};
  for (const [key, cands] of bySlot) {
    minCost[key] = cands.reduce((m, q) => Math.min(m, q.points), Infinity);
  }
  return minCost;
}

function exOtherMinCost(slots, coveredSlots, candidateSlotKey, minCostBySlot) {
  let sum = 0;
  for (const s of slots) {
    if (coveredSlots.has(s.key) || s.key === candidateSlotKey) continue;
    sum += minCostBySlot[s.key];
  }
  return sum;
}

// Construction en deux phases :
//   1) satisfaire d'abord les OI à cible exacte (fixes + favorite, l'OI la plus
//      contrainte — le moins de slots disponibles — en premier), en choisissant leurs
//      candidats au coût marginal le plus bas (le plus proche du plancher du slot) ;
//   2) glouton MRV habituel (variété/plafonds/richesse documentaire) pour le reste.
// Sans cette réservation préalable, deux OI à cible coûteuse peuvent se marcher dessus
// sur leurs slots communs lors d'un glouton à une seule passe et manquer chacune leur
// cible alors qu'une combinaison à budget suffisant existe (slots propres à chacune,
// moins chers) — observé en pratique en combinant une OI à cible fixe et une OI favorite
// dont tous les candidats coûtent 3 points.
function exTryBuild(questions, slots, oiList, favoriOi, favoriTarget, fixedTargets, maxPoints, rng, relaxDiversityOis) {
  const relaxDiversity = relaxDiversityOis || new Set();
  const aspects = slots.flatMap(s => s.aspects);
  const bySlot = new Map(slots.map(s => {
    const key = s.aspects.slice().sort().join('|');
    const cands = questions.filter(q => {
      const qa = exAspectsOf(q).filter(a => aspects.includes(a));
      if (!qa.length || qa.slice().sort().join('|') !== key) return false;
      return !s.pinnedOi || q.oi === s.pinnedOi;
    });
    return [s.key, cands];
  }));
  for (const s of slots) {
    if (!bySlot.get(s.key).length) return null; // slot sans aucun candidat exact : impossible
  }
  const minCostBySlot = exMinCostBySlot(bySlot);

  const coveredSlots = new Set();
  const usedIds = new Set();
  const usedOiTag = new Set(); // "OI||clé de diversité" déjà pris — jamais deux fois la même pour une OI
  const oiCounts = {};
  const selected = [];
  let points = 0;

  function baseFilterOk(q) {
    if (usedIds.has(q.id)) return false;
    if (relaxDiversity.has(q.oi)) return true; // exception explicite : diversité désactivée pour cette OI
    const qKey = exDiversityKey(q);
    if (qKey && usedOiTag.has(q.oi + '||' + qKey)) return false;
    return true;
  }

  const slotKeyOf = new Map(); // q.id -> slot occupé, pour la phase 3 (maximisation du budget)
  function commit(q, slotKey) {
    selected.push(q);
    usedIds.add(q.id);
    coveredSlots.add(slotKey);
    const key = exDiversityKey(q);
    if (key) usedOiTag.add(q.oi + '||' + key);
    oiCounts[q.oi] = (oiCounts[q.oi] || 0) + 1;
    points += q.points;
    slotKeyOf.set(q.id, slotKey);
  }

  // ── PHASE 1 : cibles exactes (fixes + favorite) ──────────────────────────────
  const targets = { ...fixedTargets };
  if (favoriOi && favoriTarget > 0) targets[favoriOi] = favoriTarget;
  const availCount = oi => slots.filter(s => bySlot.get(s.key).some(q => q.oi === oi)).length;
  const targetOis = Object.keys(targets).sort((a, b) => availCount(a) - availCount(b));

  for (const oi of targetOis) {
    while ((oiCounts[oi] || 0) < targets[oi]) {
      const eligibleSlots = slots.filter(s => !coveredSlots.has(s.key) && bySlot.get(s.key).some(q => q.oi === oi));
      const scored = [];
      for (const s of eligibleSlots) {
        for (const q of bySlot.get(s.key)) {
          if (q.oi !== oi || !baseFilterOk(q)) continue;
          const otherMin = exOtherMinCost(slots, coveredSlots, s.key, minCostBySlot);
          if (points + q.points + otherMin > maxPoints) continue;
          scored.push({ q, slotKey: s.key, pinned: s.pinnedOi === oi ? 1 : 0, marginal: q.points - minCostBySlot[s.key], jitter: (rng || Math.random)() });
        }
      }
      if (!scored.length) return null; // cible infaisable pour cette OI dans ce budget
      // Priorité absolue à un slot épinglé pour cette OI (`pinnedOi`) — sinon il risquerait
      // de ne jamais être consommé (aucune autre OI ne peut le remplir) et de faire échouer
      // toute la tentative une fois la cible déjà atteinte par d'autres slots.
      scored.sort((a, b) => (b.pinned - a.pinned) || (a.marginal - b.marginal) || (a.jitter - b.jitter));
      commit(scored[0].q, scored[0].slotKey);
    }
  }

  // ── PHASE 2 : glouton MRV habituel pour les slots restants ─────────────────
  const oiRemaining = exComputeOiQuota(oiList, favoriOi, favoriTarget, fixedTargets);
  Object.keys(oiCounts).forEach(oi => { oiRemaining[oi] = (oiRemaining[oi] || 0) - oiCounts[oi]; });

  const remainingSlots = slots.filter(s => !coveredSlots.has(s.key));
  const order = exShuffle(remainingSlots, rng).sort((a, b) => bySlot.get(a.key).length - bySlot.get(b.key).length);

  for (const slot of order) {
    if (coveredSlots.has(slot.key)) continue;

    const candidates = bySlot.get(slot.key).filter(q => {
      if (!baseFilterOk(q)) return false;
      if ((oiCounts[q.oi] || 0) >= exOiCap(q.oi, favoriOi, favoriTarget, fixedTargets)) return false; // plafond OI atteint
      const otherMin = exOtherMinCost(slots, coveredSlots, slot.key, minCostBySlot);
      return points + q.points + otherMin <= maxPoints;
    });
    if (!candidates.length) return null;

    const scored = candidates.map(q => ({
      q,
      // Le bonus est proportionnel au déficit de quota de l'OI du candidat (et non un
      // simple drapeau « encore du quota ? ») : les OI déjà comblées en phase 1 ont un
      // déficit nul ou négatif ici et ne sont donc plus artificiellement favorisées.
      // Léger malus au coût en points : à budget serré (cibles fixes/favorite déjà
      // engagées en phase 1), préférer le candidat le moins cher entre deux slots
      // équivalents laisse plus de marge pour les slots encore à traiter plus loin
      // dans la boucle — sans ce malus, un candidat plus cher mais mieux noté sur la
      // richesse documentaire pouvait grignoter la marge nécessaire à un slot ultérieur.
      score: Math.max(0, oiRemaining[q.oi] || 0) * 4 + exDocRichness(q) - q.points * 3 + (rng || Math.random)() * 3
    }));
    scored.sort((a, b) => b.score - a.score);
    const topN = scored.slice(0, Math.min(3, scored.length));
    const picked = topN[Math.floor((rng || Math.random)() * topN.length)].q;

    commit(picked, slot.key);
    if (oiRemaining[picked.oi] != null) oiRemaining[picked.oi]--;
  }

  // ── PHASE 3 : maximiser le budget utilisé (viser maxPoints, jamais le dépasser) ──────
  // La phase 1 privilégie le coût marginal le plus bas pour chaque cible — quand les
  // aspects/OI sont presque tous « ciblés » (ex. distribution d'OI dédiée à une période,
  // voir EX_OI_FIXED_TARGET_BY_PERIODE), il reste peu ou pas de slots libres en phase 2
  // pour absorber le budget restant, et le total peut finir bien en dessous de maxPoints.
  // On tente alors de remplacer chaque question par une alternative plus chère de la
  // MÊME OI sur le MÊME slot (jamais un changement d'OI : les comptes par OI restent
  // exacts), en respectant toujours la règle de diversité (clé déjà prise ailleurs pour
  // cette OI). Plusieurs passes, au cas où un remplacement en libère un autre.
  let boosted = true;
  let guard = 0;
  while (points < maxPoints && boosted && guard < slots.length * 4) {
    boosted = false;
    guard++;
    for (const q of selected.slice()) {
      if (points >= maxPoints) break;
      const slotKey = slotKeyOf.get(q.id);
      const qKeyOld = exDiversityKey(q);
      const alternatives = bySlot.get(slotKey)
        .filter(c => c.id !== q.id && c.oi === q.oi && !usedIds.has(c.id) && c.points > q.points)
        .filter(c => {
          if (relaxDiversity.has(c.oi)) return true;
          const cKey = exDiversityKey(c);
          if (!cKey) return true;
          return cKey === qKeyOld || !usedOiTag.has(c.oi + '||' + cKey);
        })
        .sort((a, b) => b.points - a.points);
      const alt = alternatives.find(c => points - q.points + c.points <= maxPoints);
      if (!alt) continue;
      const idx = selected.indexOf(q);
      selected[idx] = alt;
      usedIds.delete(q.id); usedIds.add(alt.id);
      if (qKeyOld) usedOiTag.delete(q.oi + '||' + qKeyOld);
      const altKey = exDiversityKey(alt);
      if (altKey) usedOiTag.add(alt.oi + '||' + altKey);
      slotKeyOf.delete(q.id); slotKeyOf.set(alt.id, slotKey);
      points += alt.points - q.points;
      boosted = true;
    }
  }

  // ── PHASE 3b : échange de slot entre deux OI différentes ─────────────────────────────
  // Le remplacement ci-dessus ne considère que des alternatives de la MÊME OI sur le MÊME
  // slot — inefficace si le slot assigné à une OI n'offre qu'un seul sous-tag (aucune
  // alternative plus chère possible SUR CET ASPECT PRÉCIS), même si un autre slot (assigné
  // à une autre OI) a justement un candidat de cette OI plus cher. Échanger lequel des deux
  // slots héberge quelle OI ne change aucun compte par OI (juste les points).
  let pairBoosted = true;
  let pairGuard = 0;
  while (points < maxPoints && pairBoosted && pairGuard < slots.length * slots.length) {
    pairBoosted = false;
    pairGuard++;
    for (let i = 0; i < selected.length && !pairBoosted; i++) {
      for (let j = 0; j < selected.length && !pairBoosted; j++) {
        if (i === j) continue;
        const q1 = selected[i], q2 = selected[j];
        if (q1.oi === q2.oi) continue;
        const slot1 = slotKeyOf.get(q1.id), slot2 = slotKeyOf.get(q2.id);
        const key1Old = exDiversityKey(q1), key2Old = exDiversityKey(q2);
        // retire temporairement les deux clés en cours, pour évaluer les alternatives
        // sans qu'elles se bloquent elles-mêmes.
        if (key1Old) usedOiTag.delete(q1.oi + '||' + key1Old);
        if (key2Old) usedOiTag.delete(q2.oi + '||' + key2Old);

        const diversityOk = c => relaxDiversity.has(c.oi) || !exDiversityKey(c) || !usedOiTag.has(c.oi + '||' + exDiversityKey(c));
        const alt1Options = bySlot.get(slot1).filter(c => c.oi === q2.oi && c.id !== q2.id && !usedIds.has(c.id) && diversityOk(c));
        const alt2Options = bySlot.get(slot2).filter(c => c.oi === q1.oi && c.id !== q1.id && !usedIds.has(c.id) && diversityOk(c));

        let bestDelta = 0, bestAlt1 = null, bestAlt2 = null;
        for (const a1 of alt1Options) {
          for (const a2 of alt2Options) {
            if (a1.id === a2.id) continue;
            const delta = (a1.points + a2.points) - (q1.points + q2.points);
            if (delta > bestDelta && points + delta <= maxPoints) { bestDelta = delta; bestAlt1 = a1; bestAlt2 = a2; }
          }
        }

        if (key1Old) usedOiTag.add(q1.oi + '||' + key1Old);
        if (key2Old) usedOiTag.add(q2.oi + '||' + key2Old);

        if (bestAlt1 && bestAlt2) {
          selected[i] = bestAlt1; selected[j] = bestAlt2;
          usedIds.delete(q1.id); usedIds.delete(q2.id);
          usedIds.add(bestAlt1.id); usedIds.add(bestAlt2.id);
          if (key1Old) usedOiTag.delete(q1.oi + '||' + key1Old);
          if (key2Old) usedOiTag.delete(q2.oi + '||' + key2Old);
          const newKey1 = exDiversityKey(bestAlt1), newKey2 = exDiversityKey(bestAlt2);
          if (newKey1) usedOiTag.add(bestAlt1.oi + '||' + newKey1);
          if (newKey2) usedOiTag.add(bestAlt2.oi + '||' + newKey2);
          slotKeyOf.delete(q1.id); slotKeyOf.delete(q2.id);
          slotKeyOf.set(bestAlt1.id, slot1); slotKeyOf.set(bestAlt2.id, slot2);
          points += bestDelta;
          pairBoosted = true;
        }
      }
    }
  }

  if (coveredSlots.size !== slots.length) return null;
  if (selected.length !== slots.length) return null; // une question par slot, jamais moins
  if (points > maxPoints) return null;
  if (new Set(selected.map(q => q.oi)).size < oiList.length) return null; // variété OI non atteinte
  // L'OI favorite doit apparaître exactement `favoriTarget` fois (pas juste « au moins »).
  if (favoriOi && favoriTarget > 0 && oiCounts[favoriOi] !== favoriTarget) return null;
  // Les OI à cible fixe doivent apparaître exactement ce nombre de fois, toujours — via
  // `targets` (fixedTargets fusionné avec la cible favorite en phase 1), pas `fixedTargets`
  // brut : sinon une OI à la fois « cible fixe » et « favorite » (ex. Déterminer des
  // changements et des continuités, toujours ≥2 mais jusqu'à 3 si favorite) serait
  // rejetée dès que la cible favorite (3) dépasse sa cible fixe de fond (2).
  for (const oi of Object.keys(targets)) {
    if ((oiCounts[oi] || 0) !== targets[oi]) return null;
  }

  return { selected, points };
}

// Écarts d'indices visés entre deux occurrences d'une même OI, du plus confortable
// (4 = 3 questions différentes entre les deux) au strict minimum (2 = jamais adjacentes,
// dernier filet de sécurité si les comptes par OI rendent un espacement plus large
// impossible sur cette liste précise).
const EX_OI_SPACING_GAPS = [4, 3, 2];

// Place gloutonnement les questions en respectant (si possible) l'écart minGap entre
// deux occurrences d'une même OI : à chaque position, choisit parmi les OI dont le
// dernier placement remonte à au moins minGap celle qui a le plus de questions encore
// en attente (pour éviter de la coincer plus tard) ; si aucune OI n'est éligible (écart
// infaisable ici), relâche au minimum en prenant la moins récemment placée. Algorithme
// classique de réarrangement à distance minimale (cf. « Rearrange String k Distance
// Apart ») — l'ordre relatif d'origine (ordre des aspects) est conservé au sein de
// chaque groupe.
function exSpreadOi(list, minGap) {
  const groups = new Map();
  list.forEach(item => {
    if (!groups.has(item.oi)) groups.set(item.oi, []);
    groups.get(item.oi).push(item);
  });
  const queues = [...groups.values()].map(items => ({ items: items.slice(), lastIdx: -Infinity }));
  const result = [];
  for (let i = 0; i < list.length; i++) {
    const eligible = queues.filter(g => g.items.length && (i - g.lastIdx) >= minGap);
    const pool = eligible.length ? eligible : queues.filter(g => g.items.length);
    pool.sort((a, b) => (eligible.length ? b.items.length - a.items.length : 0) || a.lastIdx - b.lastIdx);
    const picked = pool[0];
    picked.lastIdx = i;
    result.push(picked.items.shift());
  }
  return result;
}

function exSpacingOk(list, minGap) {
  const lastIdx = new Map();
  for (let i = 0; i < list.length; i++) {
    const oi = list[i].oi;
    if (lastIdx.has(oi) && (i - lastIdx.get(oi)) < minGap) return false;
    lastIdx.set(oi, i);
  }
  return true;
}

// Réordonne une liste triée (ordre des aspects du programme) pour espacer au mieux les
// répétitions d'une même OI : essaie l'écart le plus confortable de EX_OI_SPACING_GAPS
// en premier, retient le premier qui respecte réellement cet écart sur cette liste
// précise, et se rabat sur un écart plus court sinon — la seule garantie absolue est de
// ne jamais placer deux questions de la même OI l'une juste après l'autre.
function exReorderNoAdjacentOi(list) {
  for (const gap of EX_OI_SPACING_GAPS) {
    const candidate = exSpreadOi(list, gap);
    if (exSpacingOk(candidate, gap)) return candidate;
  }
  return exSpreadOi(list, 2);
}

// Génère un examen pour une période donnée.
//   questions   : QUESTIONS filtrées (ou non — le filtre par période est fait ici)
//   aspects     : liste des aspects du programme à couvrir (ASPECTS_PAR_PERIODE[periode])
//   oiList      : liste canonique des OI (OI_LIST)
//   favoriOi    : OI à privilégier (ou null/undefined)
//   maxPoints   : budget de points maximum (25 par défaut)
//   rng         : générateur pseudo-aléatoire optionnel (tests reproductibles)
function exGenererExamen({ questions, periode, aspects, oiList, favoriOi, maxPoints = 25, rng }) {
  const pool = questions.filter(q => q.periode === periode);
  const baseAspectRepeat = EX_ASPECT_REPEAT_BY_PERIODE[periode] || {};
  const varietyExclude = new Set(EX_OI_VARIETY_EXCLUDE_BY_PERIODE[periode] || []);
  // Cibles fixes globales (EX_OI_FIXED_TARGET) + cibles propres à cette période
  // (EX_OI_FIXED_TARGET_BY_PERIODE) — ex. P1 où l'enseignant a choisi une distribution
  // d'OI précise à la place de la variété générale habituelle.
  const baseFixedTarget = { ...EX_OI_FIXED_TARGET, ...(EX_OI_FIXED_TARGET_BY_PERIODE[periode] || {}) };

  let attemptsTotal = 0;
  let appliedTarget = 0;
  let appliedFixedTargets = baseFixedTarget;

  // Construit les slots + l'OI atteignable pour un jeu (aspectRepeat, fixedTargetsRaw)
  // donné, puis tente exTryBuild jusqu'à EX_ATTEMPTS_PER_LEVEL fois.
  function tryLevel(aspectRepeat, fixedTargetsRaw, favoriOiForBuild, favoriTargetForBuild, relaxDiversityOis, aspectPin) {
    const slots = exBuildAspectSlots(pool, aspects, aspectRepeat, aspectPin);
    const availableOis = new Set();
    slots.forEach(s => {
      const slotKey = s.aspects.slice().sort().join('|');
      pool.forEach(q => {
        const qa = exAspectsOf(q).filter(a => aspects.includes(a));
        if (qa.length && qa.slice().sort().join('|') === slotKey) availableOis.add(q.oi);
      });
    });
    const effectiveOiList = oiList.filter(oi => availableOis.has(oi) && !varietyExclude.has(oi));
    const fixedTargets = {};
    Object.keys(fixedTargetsRaw).forEach(oi => { if (availableOis.has(oi)) fixedTargets[oi] = fixedTargetsRaw[oi]; });

    for (let attempt = 0; attempt < EX_ATTEMPTS_PER_LEVEL; attempt++) {
      attemptsTotal++;
      const result = exTryBuild(pool, slots, effectiveOiList, favoriOiForBuild, favoriTargetForBuild, fixedTargets, maxPoints, rng, relaxDiversityOis);
      if (result) return result;
    }
    return null;
  }

  function finalize(result) {
    // Ordonne les questions selon l'ordre canonique des aspects (ordre du programme),
    // puis corrige les OI consécutives identiques (voir exReorderNoAdjacentOi).
    const byAspectOrder = result.selected.slice().sort((a, b) => {
      const ia = Math.min(...exAspectsOf(a).map(x => aspects.indexOf(x)).filter(i => i >= 0));
      const ib = Math.min(...exAspectsOf(b).map(x => aspects.indexOf(x)).filter(i => i >= 0));
      return ia - ib;
    });
    const selected = exReorderNoAdjacentOi(byAspectOrder);
    return {
      ok: true, selected, points: result.points, attempts: attemptsTotal,
      favoriTargetApplied: appliedTarget, fixedTargetsApplied: appliedFixedTargets
    };
  }

  // 1) Scénarios propres à (période, favori) — voir EX_FAVORI_SCENARIOS_BY_PERIODE.
  // Traités comme des cibles fixes pures (favoriOi/favoriTarget désactivés pour la
  // construction elle-même : la cible de l'OI favorite est déjà encodée dans `targets`).
  const favoriScenarios = ((EX_FAVORI_SCENARIOS_BY_PERIODE[periode] || {})[favoriOi]) || [];
  for (const scenario of favoriScenarios) {
    const aspectRepeat = { ...baseAspectRepeat };
    Object.keys(scenario.extraSlots || {}).forEach(a => {
      aspectRepeat[a] = (aspectRepeat[a] || 1) + scenario.extraSlots[a];
    });
    const fixedTargetsRaw = { ...baseFixedTarget, ...(scenario.targets || {}) };
    appliedFixedTargets = fixedTargetsRaw;
    const relaxDiversityOis = new Set(scenario.relaxDiversity || []);
    const result = tryLevel(aspectRepeat, fixedTargetsRaw, null, 0, relaxDiversityOis, scenario.aspectPin);
    if (result) return finalize(result);
  }

  // 2) Repli générique habituel : dégradation des cibles fixes de base + de l'OI
  // favorite (préférence de fond, indépendante des scénarios ci-dessus).
  const favoriLevels = favoriOi ? exFavoriTargetLevels(favoriOi) : [0];
  const fixedLevels = exFixedTargetLevels(baseFixedTarget);
  // L'OI favorite est le choix explicite de l'enseignant pour CET examen ; les cibles
  // fixes sont une préférence de fond. En cas de conflit de budget entre les deux
  // (ex. une OI favorite dont tous les candidats coûtent 3 points + une cible fixe à 2),
  // on assouplit d'abord les cibles fixes avant de sacrifier davantage l'OI favorite —
  // d'où la boucle favori à l'extérieur, cibles fixes à l'intérieur.
  for (const favoriTarget of favoriLevels) {
    for (const fixedTargetsRaw of fixedLevels) {
      appliedTarget = favoriTarget;
      appliedFixedTargets = fixedTargetsRaw;
      const result = tryLevel(baseAspectRepeat, fixedTargetsRaw, favoriOi, favoriTarget);
      if (result) return finalize(result);
    }
  }
  return {
    ok: false,
    reason: "Impossible de générer un examen respectant toutes les contraintes (aspects du programme, budget de points, variété des OI) après " + attemptsTotal + " tentatives. Réessayez, ou réduisez les contraintes."
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Numérotation globale des documents (lettres locales → chiffres globaux)
// ─────────────────────────────────────────────────────────────────────────────

// Aplati les documents d'une question en une liste de « cols » avec leur lettre
// locale d'origine (A, B, C… dans l'ordre d'apparition, comme saisi dans admin.html).
function exFlattenDocs(q) {
  const flat = [];
  (q.documents || []).forEach(d => {
    (d.cols || [d]).forEach(col => {
      flat.push({ col, letter: String.fromCharCode(65 + flat.length) });
    });
  });
  return flat;
}

// Détecte si l'énoncé cite explicitement des documents par lettre (« document(s) A »,
// « A et B », « A à C »…) — même regex que exRemapTexte, sans capturer les numéros.
function exHasDocCitation(enonce) {
  return /[Dd]ocuments?\s+[A-Z]\b/.test(enonce || '');
}

// Construit l'ordre final des documents pour le dossier documentaire. Les documents
// d'une question dont l'énoncé cite des lettres précises (ex. « les documents A à C »)
// restent groupés et dans leur ordre d'origine — le texte s'y réfère comme une séquence,
// ils doivent donc rester consécutifs — mais ce bloc peut être placé n'importe où dans
// le dossier. Les documents des questions SANS citation explicite sont traités
// individuellement et mélangés dans tout le dossier (jamais forcément groupés par
// question), pour davantage de mélange là où rien n'impose de les garder ensemble.
function exOrderDocItems(selection, rng) {
  const blocks = [];
  selection.forEach(q => {
    const flat = exFlattenDocs(q).map(({ col, letter }) => ({ qId: q.id, col, letter }));
    if (!flat.length) return;
    if (exHasDocCitation(q.enonce) && flat.length > 1) {
      blocks.push(flat);
    } else {
      flat.forEach(item => blocks.push([item]));
    }
  });
  return exShuffle(blocks, rng).flat();
}

// Construit la numérotation globale (1, 2, 3…) selon l'ordre mélangé de exOrderDocItems,
// et retourne :
//   - docItems  : liste plate { qId, qIndex, col, num, titre } pour le dossier
//   - byQuestion: Map qId → { letterToNum: {A:1,B:2,...}, items:[...] }
function exBuildDocMap(selection, rng) {
  const byQuestion = new Map(selection.map((q, qIndex) => [q.id, { letterToNum: {}, items: [], qIndex }]));
  const docItems = [];
  let num = 0;
  exOrderDocItems(selection, rng).forEach(({ qId, col, letter }) => {
    num += 1;
    const entry = byQuestion.get(qId);
    entry.letterToNum[letter] = num;
    const item = { qId, qIndex: entry.qIndex, col, num, titre: exRemapTitre(col.titre, num) };
    entry.items.push(item);
    docItems.push(item);
  });
  return { docItems, byQuestion };
}

// Remplace « Document X » par « Document N » dans un titre ; conserve tout
// texte additionnel après la lettre (ex. « Document A — Une lettre de… »).
// Si le titre ne suit pas ce format (donnée exotique), préfixe simplement le
// numéro pour rester cohérent avec la numérotation globale du dossier.
function exRemapTitre(titre, num) {
  const t = titre || '';
  const m = t.match(/^Document\s+[A-Z]\b(.*)$/);
  if (m) return 'Document ' + num + m[1];
  return t ? ('Document ' + num + ' — ' + t) : ('Document ' + num);
}

// Remplace les mentions « document(s) A », « documents A et B », « documents A à C »…
// dans un texte (énoncé, guide) par les numéros globaux correspondants, via la
// table de correspondance locale de la question (letterToNum). Ne touche à
// rien d'autre (ex. « la lettre » qui désigne un repère interne à une image
// reste inchangé, car il n'est jamais précédé du mot « document »).
function exRemapTexte(text, letterToNum) {
  if (!text) return text;
  return text.replace(/([Dd]ocuments?\s+)([A-Z](?:\s*(?:et|à|,)\s*[A-Z])*)\b/g, (m, prefix, letters) => {
    const replaced = letters.replace(/[A-Z]/g, ch => (letterToNum[ch] != null ? String(letterToNum[ch]) : ch));
    return prefix + replaced;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    exComputeOiQuota, exGenererExamen, exBuildDocMap, exRemapTexte, exRemapTitre,
    exFlattenDocs, exDocRichness, exAspectsOf, exDiversityKey, exOiCap,
    exReorderNoAdjacentOi, exHasDocCitation, exOrderDocItems, exFixedTargetLevels,
    exFavoriTargetLevels, exTryBuild, exEffectiveHardCap, EX_OI_HARD_CAP_RELAX,
    exBuildAspectSlots, EX_OI_FIXED_TARGET_BY_PERIODE, EX_OI_VARIETY_EXCLUDE_BY_PERIODE,
    EX_ASPECT_REPEAT_BY_PERIODE, EX_FAVORI_SCENARIOS_BY_PERIODE
  };
}
