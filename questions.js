const REGLETTES = {
"Q1": {oi: "Établir des faits", colonnes: ["1 point", "0 point"], niveaux: [{pts: 1, desc: "L'élève établit les faits."}, {pts: 0, desc: "L'élève n'établit pas les faits."}]},
"Q2": {oi: "Établir des faits", colonnes: ["1 point", "0 point"], niveaux: [{pts: 1, desc: "L'élève établit les faits."}, {pts: 0, desc: "L'élève n'établit pas les faits."}]},
"Q3": {oi: "Établir des faits", colonnes: ["1 point", "0 point"], niveaux: [{pts: 1, desc: "L'élève établit les faits."}, {pts: 0, desc: "L'élève n'établit pas les faits."}]},
"Q4": {oi: "Établir des faits", colonnes: ["1 point", "0 point"], niveaux: [{pts: 1, desc: "L'élève établit les faits."}, {pts: 0, desc: "L'élève n'établit pas les faits."}]}
}

const IMAGE_DB = {
"activites_economiques_iroquoiens.jpg": {src: "images/activites_economiques_iroquoiens.jpg", w: 1200, h: 800},
"activites_economiques_algonquiens.jpg": {src: "images/activites_economiques_algonquiens.jpg", w: 1200, h: 841},
"agriculture.jpg": {src: "images/agriculture.jpg", w: 1200, h: 800},
"chasse_1.jpg": {src: "images/chasse_1.jpg", w: 1200, h: 800}
}

const QUESTIONS = [
{
 id: "Q1",
 niveau: 3,
 oi: "Établir des faits",
 competence: "Lire l'organisation du territoire",
 periodes: ["Les Iroquoiens vers 1500"],
 points: 1,
 soustag: "Établir 1 fait - 1",
 enonce: "Nomme le mode de vie des Iroquoiens vers 1500.",
 aspects: [{aspect: "Population"}],
 documents: [{type: "textes", cols: [{titre: "Document A", ref: "activites_economiques_iroquoiens.jpg", source: "Reconstitution historique réalisée à l'aide de l'intelligence artificielle (ChatGPT, OpenAI), 2026."}]}],
 reponse: {type: "lignes", nombre: 1},
 guide: "Les Iroquoiens ont un mode de vie sédentaire.",
 updatedAt: "2026-08-14T12:39:21.893Z"
},
{
 id: "Q2",
 niveau: 3,
 oi: "Établir des faits",
 competence: "Lire l'organisation du territoire",
 periodes: ["Les Algonquiens vers 1500"],
 points: 1,
 soustag: "Établir 1 fait - 1",
 enonce: "Nomme le mode de vie des Algonquiens vers 1500.",
 aspects: [{aspect: "Personnages"}],
 documents: [{type: "textes", cols: [{titre: "Document A", ref: "activites_economiques_algonquiens.jpg", source: "Reconstitution historique réalisée à l'aide de l'intelligence artificielle (ChatGPT, OpenAI), 2026."}]}],
 reponse: {type: "lignes", nombre: 1},
 guide: "Les Algonquiens ont un mode de vie nomade.",
 updatedAt: "2026-08-14T12:39:37.239Z"
},
{
 id: "Q3",
 niveau: 3,
 oi: "Établir des faits",
 competence: "Lire l'organisation du territoire",
 periodes: ["Les Iroquoiens vers 1500"],
 points: 1,
 soustag: "Établir 1 fait - 1",
 enonce: "Nomme une activité pratiquée par les Iroquoiens pour se nourrir.",
 aspects: [{aspect: "Activités économiques"}],
 documents: [{type: "textes", cols: [{titre: "Document A", ref: "activites_economiques_iroquoiens.jpg", source: "Reconstitution historique réalisée à l'aide de l'intelligence artificielle (ChatGPT, OpenAI), 2026."}]}],
 reponse: {type: "lignes", nombre: 1},
 guide: "L'agrilculture.\nLa chasse.\nLa pêche.\nLa cueillette.",
 updatedAt: "2026-08-14T12:40:17.786Z"
},
{
 id: "Q4",
 niveau: 3,
 oi: "Établir des faits",
 competence: "Lire l'organisation du territoire",
 periodes: ["Les Algonquiens vers 1500"],
 points: 1,
 soustag: "Établir 1 fait - 2",
 enonce: "Nomme deux activités pratiquées par les Algonquiens pour se nourrir.",
 aspects: [{aspect: "Activités économiques"}],
 documents: [{type: "textes", cols: [{titre: "Document A", ref: "activites_economiques_algonquiens.jpg", source: "Reconstitution historique réalisée à l'aide de l'intelligence artificielle (ChatGPT, OpenAI), 2026."}]}],
 reponse: {type: "lignes", nombre: 1},
 guide: "La chasse.\nLa pêche.\nLa cueillette.",
 updatedAt: "2026-08-14T12:40:32.725Z"
}
]
