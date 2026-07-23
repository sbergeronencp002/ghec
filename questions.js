const REGLETTES = {
"Q1": {oi: "Établir des faits", colonnes: ["1 point", "0 point"], niveaux: [{pts: 1, desc: "L'élève établit les faits."}, {pts: 0, desc: "L'élève n'établit pas les faits."}]},
"Q2": {oi: "Établir des faits", colonnes: ["1 point", "0 point"], niveaux: [{pts: 1, desc: "L'élève établit les faits."}, {pts: 0, desc: "L'élève n'établit pas les faits."}]},
"Q3": {oi: "Établir des faits", colonnes: ["1 point", "0 point"], niveaux: [{pts: 1, desc: "L'élève établit les faits."}, {pts: 0, desc: "L'élève n'établit pas les faits."}]},
"Q4": {oi: "Établir des faits", colonnes: ["2 points", "1 point", "0 point"], niveaux: [{pts: 2, desc: "L'élève établit tous les faits. (2 sur 2)"}, {pts: 1, desc: "L'élève établit les faits. (1 sur 2)"}, {pts: 0, desc: "L'élève n'établit pas les faits. (0 sur 2)"}]}
}

const IMAGE_DB = {
"village_iroquoien_1500_a.jpg": {src: "images/village_iroquoien_1500_a.jpg", w: 1200, h: 800},
"campement_algonquien_1.jpg": {src: "images/campement_algonquien_1.jpg", w: 1200, h: 800}
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
 aspects: [{aspect: "Territoire"}],
 documents: [{type: "textes", cols: [{titre: "Document A", ref: "village_iroquoien_1500_a.jpg", source: "Reconstitution historique à des fins pédagogiques réalisée à l'aide de l'intelligence artificielle (ChatGPT, OpenAI), 2026."}]}],
 reponse: {type: "lignes", nombre: 1},
 guide: "Les Iroquoiens sont sédentaires.",
 updatedAt: "2026-07-23T13:02:04.859Z"
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
 aspects: [{aspect: "Territoire"}],
 documents: [{type: "textes", cols: [{titre: "Document A", ref: "campement_algonquien_1.jpg", source: "Reconstitution historique à des fins pédagogiques réalisée à l'aide de l'intelligence artificielle (ChatGPT, OpenAI), 2026."}]}],
 reponse: {type: "lignes", nombre: 1},
 guide: "Les Algonquiens sont nomades.",
 updatedAt: "2026-07-23T13:11:07.174Z"
},
{
 id: "Q3",
 niveau: 3,
 oi: "Établir des faits",
 competence: "Lire l'organisation du territoire",
 periodes: ["Les Iroquoiens vers 1500"],
 points: 1,
 soustag: "Établir 1 fait - 1",
 enonce: "Nomme une activité que les Iroquoiens pratiquent pour se nourrir.",
 aspects: [{aspect: "Activités économiques"}],
 documents: [{type: "textes", cols: [{titre: "Document A", ref: "village_iroquoien_1500_a.jpg", source: "Reconstitution historique à des fins pédagogiques réalisée à l'aide de l'intelligence artificielle (ChatGPT, OpenAI), 2026."}]}],
 reponse: {type: "lignes", nombre: 1},
 guide: "Les Iroquoiens pratiquent l'agriculture.\nL'agriculture.",
 updatedAt: "2026-07-23T13:15:00.179Z"
},
{
 id: "Q4",
 niveau: 3,
 oi: "Établir des faits",
 competence: "Lire l'organisation du territoire",
 periodes: ["Les Algonquiens vers 1500"],
 points: 2,
 soustag: "Établir tous les faits - 2",
 enonce: "Nomme deux activités que les Algonquiens pratiquent pour se nourrir.",
 aspects: [{aspect: "Activités économiques"}],
 documents: [{type: "textes", cols: [{titre: "Document A", ref: "campement_algonquien_1.jpg", source: "Reconstitution historique à des fins pédagogiques réalisée à l'aide de l'intelligence artificielle (ChatGPT, OpenAI), 2026."}]}],
 reponse: {type: "lignes", nombre: 2},
 guide: "Les Algonquiens pratiquent la chasse, la pêche et la cueillette.",
 updatedAt: "2026-07-23T13:16:21.725Z"
}
]
