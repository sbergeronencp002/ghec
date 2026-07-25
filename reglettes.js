// ─────────────────────────────────────────────────────────────────────
// Préréglages de réglettes par OI (REGLETTES_PRESET) — chargé par admin.html
// uniquement. Clé = nom d'OI (doit correspondre à une clé de OI_CONFIG dans
// oi-config.js). Chaque preset : { label, colonnes:[...], niveaux:[{pts,desc}] }.
//
// Transcrit depuis « Les billets de sortie en U — Opérations intellectuelles
// GHEC3 » (S. Bergeron, CSS des Bois-Francs, 2025).
// ─────────────────────────────────────────────────────────────────────
const REGLETTES_PRESET = {
  "Situer dans le temps": [
    { label:"1 pt — les faits", colonnes:["1 point","0 point"], niveaux:[
      {pts:1, desc:"L'élève situe les faits dans le temps."},
      {pts:0, desc:"L'élève ne situe pas les faits dans le temps."}
    ] },
    { label:"2 pts — les faits", colonnes:["2 points","0 point"], niveaux:[
      {pts:2, desc:"L'élève situe les faits dans le temps."},
      {pts:0, desc:"L'élève ne situe pas les faits dans le temps."}
    ] },
    { label:"2 pts — 4 sur 4", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève situe tous les faits dans le temps. (4 sur 4)"},
      {pts:1, desc:"L'élève situe certains faits dans le temps. (3 ou 2 sur 4)"},
      {pts:0, desc:"L'élève ne situe pas suffisamment les faits dans le temps. (1 ou 0 sur 4)"}
    ] }
  ],
  "Situer dans l'espace": [
    { label:"1 pt — 1 élément", colonnes:["1 point","0 point"], niveaux:[
      {pts:1, desc:"L'élève situe le fait dans l'espace."},
      {pts:0, desc:"L'élève ne situe pas le fait dans l'espace."}
    ] },
    { label:"2 pts — 2 éléments", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève situe les faits dans l'espace."},
      {pts:1, desc:"L'élève situe un fait dans l'espace."},
      {pts:0, desc:"L'élève ne situe pas les faits dans l'espace."}
    ] }
  ],
  "Établir des faits": [
    { label:"1 pt — le fait", colonnes:["1 point","0 point"], niveaux:[
      {pts:1, desc:"L'élève établit les faits."},
      {pts:0, desc:"L'élève n'établit pas les faits."}
    ] },
    { label:"2 pts — le fait", colonnes:["2 points","0 point"], niveaux:[
      {pts:2, desc:"L'élève établit les faits."},
      {pts:0, desc:"L'élève n'établit pas les faits."}
    ] },
    { label:"2 pts — 2 sur 2", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève établit tous les faits. (2 sur 2)"},
      {pts:1, desc:"L'élève établit un fait. (1 sur 2)"},
      {pts:0, desc:"L'élève n'établit pas les faits. (0 sur 2)"}
    ] }
  ],
  "Caractériser un territoire": [
    { label:"1 pt — une caractéristique", colonnes:["1 point","0 point"], niveaux:[
      {pts:1, desc:"L'élève indique une caractéristique."},
      {pts:0, desc:"L'élève n'indique pas de caractéristique."}
    ] },
    { label:"2 pts — deux caractéristiques", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève indique deux caractéristiques."},
      {pts:1, desc:"L'élève indique une caractéristique."},
      {pts:0, desc:"L'élève n'indique pas de caractéristique."}
    ] },
    { label:"3 pts — trois caractéristiques", colonnes:["3 points","2 points","1 point","0 point"], niveaux:[
      {pts:3, desc:"L'élève indique trois caractéristiques."},
      {pts:2, desc:"L'élève indique deux caractéristiques."},
      {pts:1, desc:"L'élève indique une caractéristique."},
      {pts:0, desc:"L'élève n'indique pas de caractéristique."}
    ] },
    { label:"2 pts — trois caractéristiques (3 sur 3)", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève indique trois caractéristiques. (3 sur 3)"},
      {pts:1, desc:"L'élève indique deux caractéristiques. (2 sur 3)"},
      {pts:0, desc:"L'élève n'indique pas suffisamment de caractéristiques. (1 ou 0 sur 3)"}
    ] }
  ],
  "Établir des comparaisons": [
    { label:"2 pts — différence", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève établit la différence."},
      {pts:1, desc:"L'élève établit plus ou moins la différence."},
      {pts:0, desc:"L'élève n'établit pas la différence."}
    ] },
    { label:"2 pts — similitude", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève établit la similitude."},
      {pts:1, desc:"L'élève établit plus ou moins la similitude."},
      {pts:0, desc:"L'élève n'établit pas la similitude."}
    ] }
  ],
  "Déterminer des changements": [
    { label:"2 pts — changement", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève détermine le changement."},
      {pts:1, desc:"L'élève détermine plus ou moins le changement."},
      {pts:0, desc:"L'élève ne détermine pas le changement."}
    ] },
    { label:"2 pts — continuité", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève détermine la continuité."},
      {pts:1, desc:"L'élève détermine plus ou moins la continuité."},
      {pts:0, desc:"L'élève ne détermine pas la continuité."}
    ] }
  ],
  "Mettre en relation des faits": [
    { label:"2 pts — 3 sur 3", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève met en relation tous les faits. (3 sur 3)"},
      {pts:1, desc:"L'élève met en relation les faits. (2 sur 3)"},
      {pts:0, desc:"L'élève ne met pas suffisamment en relation les faits. (1 ou 0 sur 3)"}
    ] },
    { label:"2 pts — 4 sur 4", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève met en relation tous les faits. (4 sur 4)"},
      {pts:1, desc:"L'élève met en relation les faits. (3 ou 2 sur 4)"},
      {pts:0, desc:"L'élève ne met pas suffisamment en relation les faits. (1 ou 0 sur 4)"}
    ] }
  ],
  "Établir des liens de causalité": [
    { label:"2 pts — le lien de causalité", colonnes:["2 points","1 point","0 point"], niveaux:[
      {pts:2, desc:"L'élève établit correctement le lien de causalité."},
      {pts:1, desc:"L'élève établit partiellement le lien de causalité."},
      {pts:0, desc:"L'élève n'établit pas le lien de causalité."}
    ] }
  ]
}
