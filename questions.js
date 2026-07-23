const REGLETTES = {
"Q1": {oi: "Établir des faits", colonnes: ["1 point", "0 point"], niveaux: [{pts: 1, desc: "L'élève établit les faits."}, {pts: 0, desc: "L'élève n'établit pas les faits."}]}
}

const IMAGE_DB = {
"village_iroquoien_1500.jpg": {src: "images/village_iroquoien_1500.jpg", w: 1200, h: 800}
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
 documents: [{type: "textes", cols: [{titre: "Document A", ref: "village_iroquoien_1500.jpg", source: "Reconstitution historique à des fins pédagogiques réalisée à l'aide de l'intelligence artificielle (ChatGPT, OpenAI), 2026."}]}],
 reponse: {type: "lignes", nombre: 1},
 guide: "Les Iroquoiens sont sédentaires.",
 updatedAt: "2026-07-23T13:02:04.859Z"
}
]
