// ─────────────────────────────────────────────────────────────────────
// Source unique de vérité pour les opérations intellectuelles / compétences (OI).
// Chargé par index.html (site public) ET admin.html (gestion).
//
// Vide au départ — géré depuis la section « Configuration » d'admin.html
// (aucune édition manuelle de ce fichier n'est nécessaire ; la page publie
// directement sur GitHub, comme pour questions.js).
//
//   - cls   : optionnel, non utilisé par le rendu (color/bg suffisent).
//   - color / bg : var(--c-slot1) … var(--c-slot8), voir style.css — 8 couleurs
//     prédéfinies disponibles, une par OI (au-delà de 8, repli gris automatique).
//   - soustags   : pills « sous-tag » proposées dans l'admin (optionnel).
//   - autoReponse : type de réponse pré-sélectionné quand on choisit l'OI (optionnel).
//
// OI_LIST = ordre du menu déroulant de l'admin (doit contenir exactement les
// mêmes clés que OI_CONFIG).
//
// Les réglettes prémémorisées restent dans reglettes.js (REGLETTES_PRESET).
// ─────────────────────────────────────────────────────────────────────
const OI_CONFIG = {
}

const OI_LIST = [
]
