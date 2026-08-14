const REGLETTES = {
"Q1": {oi: "Établir des faits", colonnes: ["1 point", "0 point"], niveaux: [{pts: 1, desc: "L'élève établit les faits."}, {pts: 0, desc: "L'élève n'établit pas les faits."}]},
"Q2": {oi: "Établir des faits", colonnes: ["1 point", "0 point"], niveaux: [{pts: 1, desc: "L'élève établit les faits."}, {pts: 0, desc: "L'élève n'établit pas les faits."}]},
"Q3": {oi: "Établir des faits", colonnes: ["1 point", "0 point"], niveaux: [{pts: 1, desc: "L'élève établit les faits."}, {pts: 0, desc: "L'élève n'établit pas les faits."}]}
}

const IMAGE_DB = {
"activites_economiques_iroquoiens.jpg": {src: "images/activites_economiques_iroquoiens.jpg", w: 1200, h: 800},
"activites_economiques_algonquiens.jpg": {src: "images/activites_economiques_algonquiens.jpg", w: 1200, h: 841}
}

const QUESTIONS = [
{id: "Q1", niveau: 3, oi: "Établir des faits", competence: "Lire l'organisation du territoire", periodes: ["Les Iroquoiens vers 1500"], points: 1, soustag: "Établir 1 fait - 1", enonce: "Nomme le mode de vie des Iroquoiens vers 1500.", aspects: [{aspect: "Population"}], documents: [], reponse: {type: "lignes", nombre: 1}, guide: "Les Iroquoiens ont un mode de vie sédentaire.", updatedAt: "2026-08-14T12:35:01.718Z"},
{id: "Q2", niveau: 3, oi: "Établir des faits", competence: "Lire l'organisation du territoire", periodes: ["Les Algonquiens vers 1500"], points: 1, soustag: "Établir 1 fait - 1", enonce: "Nomme le mode de vie des Algonquiens vers 1500.", aspects: [{aspect: "Personnages"}], documents: [], reponse: {type: "lignes", nombre: 1}, guide: "Les Algonquiens ont un mode de vie nomade.", updatedAt: "2026-08-14T12:35:58.339Z"},
{id: "Q3", niveau: 3, oi: "Établir des faits", competence: "Lire l'organisation du territoire", periodes: ["Les Iroquoiens vers 1500"], points: 1, soustag: "Établir 1 fait - 1", enonce: "Nomme une activité pratiquée par les Iroquoiens pour se nourrir.", aspects: [{aspect: "Activités économiques"}], documents: [], reponse: {type: "lignes", nombre: 1}, guide: "L'agrilculture.", updatedAt: "2026-08-14T12:36:25.008Z"}
]
