// ─────────────────────────────────────────────────────────────────────────────
// Génération des 3 DOCX de l'examen (questionnaire, dossier documentaire,
// guide de correction) via docx.js (chargé en lazy, même bibliothèque que
// app.js). Dépend des globales définies dans examen.html : QUESTIONS,
// REGLETTES, IMAGE_DB, EX_SELECTION, EX_DOCMAP, EX_PERIODE, escH, toast,
// ainsi que des fonctions pures de examen-gen.js (exRemapTexte, exAspectsOf…).
// ─────────────────────────────────────────────────────────────────────────────

let _imgDocxCache = {};
let _docxLoadPromise = null;

async function exEnsureDocx() {
  if (typeof docx !== 'undefined') return;
  if (!_docxLoadPromise) {
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

// Fetch + redimensionne (max 1200px) + met en cache base64 les images nécessaires.
async function exResolveImages(neededKeys) {
  const MAX_PX = 1200;
  const JPEG_Q = 0.78;
  const failed = [];
  const promises = neededKeys.map(async key => {
    const entry = IMAGE_DB[key];
    if (!entry || _imgDocxCache[key]) return;
    try {
      const resp = await fetch(entry.src);
      const blob = await resp.blob();
      const isJpeg = blob.type === 'image/jpeg' || /\.(jpg|jpeg)$/i.test(key);
      const dataUrl = await new Promise((resolve, reject) => {
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
          resolve({ url: canvas.toDataURL(isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? JPEG_Q : undefined), w, h });
        };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(); };
        img.src = blobUrl;
      });
      _imgDocxCache[key] = { src: dataUrl.url, w: dataUrl.w, h: dataUrl.h };
    } catch (e) {
      failed.push(key);
      console.warn("Impossible de charger l'image :", key, e);
    }
  });
  await Promise.all(promises);
  return failed;
}

function exB64ToBytes(src) {
  const b64 = src.split(',')[1];
  if (!b64) return null;
  const bStr = atob(b64);
  const bytes = new Uint8Array(bStr.length);
  for (let i = 0; i < bStr.length; i++) bytes[i] = bStr.charCodeAt(i);
  return bytes;
}

const EX_PAGE_W = 9360; // 6.5 pouces en DXA (marges 2.54cm) — dossier documentaire et guide de correction
const EX_PAGE_W_Q = 11106; // page 12240 DXA (lettre) - marges 1cm/1cm (567+567) — questionnaire seulement

function exBuildConstants() {
  const { BorderStyle } = docx;
  const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  return {
    BORDER,
    BORDERS: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    CELL_MARGINS: { top: 60, bottom: 60, left: 80, right: 80 }
  };
}

function exMkRuns(line, font, size) {
  const { TextRun } = docx;
  const parts = line.split(/(\*\*.*?\*\*)/);
  return parts.filter(p => p).map(p => {
    const bold = p.startsWith('**') && p.endsWith('**');
    return new TextRun({ text: bold ? p.slice(2, -2) : p, font, size, bold });
  });
}
function exMkLine(line, font, size) {
  const { Paragraph, TextRun } = docx;
  if (line.startsWith('• ')) {
    // Retrait en accolade (hanging indent) : si la puce s'étend sur 2 lignes, la 2ᵉ ligne
    // s'aligne sous le texte (426) plutôt que sous la puce elle-même (426-142=284).
    return new Paragraph({ indent: { left: 426, hanging: 142 }, children: [new TextRun({ text: '• ', font, size }), ...exMkRuns(line.slice(2), font, size)] });
  }
  return new Paragraph({ children: exMkRuns(line, font, size) });
}

// DrawingML ellipse (cercles à encercler) — identique à app.js.
let _exShapeId = 30000 + Math.floor(Math.random() * 1000);
function exMakeEllipseRun() {
  const { XmlComponent } = docx;
  class EllipseRun extends XmlComponent {
    constructor(cx, cy) {
      super('w:r');
      this._id = String(++_exShapeId);
      this._cx = String(cx);
      this._cy = String(cy);
    }
    prepForXml() {
      const { _cx: cx, _cy: cy, _id: id } = this;
      return { 'w:r': [{ 'w:drawing': [{ 'wp:inline': [
        { _attr: { distT: '0', distB: '0', distL: '0', distR: '0' } },
        { 'wp:extent': [{ _attr: { cx, cy } }] },
        { 'wp:effectExtent': [{ _attr: { l: '0', t: '0', r: '0', b: '0' } }] },
        { 'wp:docPr': [{ _attr: { id, name: 'Ellipse ' + id } }] },
        { 'wp:cNvGraphicFramePr': {} },
        { 'a:graphic': [
          { _attr: { 'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main' } },
          { 'a:graphicData': [
            { _attr: { uri: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape' } },
            { 'wps:wsp': [
              { _attr: { 'xmlns:wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape' } },
              { 'wps:cNvSpPr': {} },
              { 'wps:spPr': [
                { 'a:xfrm': [{ 'a:off': [{ _attr: { x: '0', y: '0' } }] }, { 'a:ext': [{ _attr: { cx, cy } }] }] },
                { 'a:prstGeom': [{ _attr: { prst: 'ellipse' } }, { 'a:avLst': {} }] },
                { 'a:noFill': {} },
                { 'a:ln': [{ 'a:solidFill': [{ 'a:srgbClr': [{ _attr: { val: '000000' } }] }] }] }
              ] },
              { 'wps:bodyPr': [{ _attr: { anchor: 'ctr' } }] }
            ] }
          ] }
        ] }
      ] }] }] };
    }
  }
  return EllipseRun;
}

// ─────────────────────────────────────────────────────────────────────────────
// Réglette (portée depuis app.js genererDocx → buildReglette)
// ─────────────────────────────────────────────────────────────────────────────
// `pageW` : largeur de contenu utilisable (DXA) — le questionnaire a des marges plus
// étroites que le dossier/guide, donc une largeur différente de EX_PAGE_W.
// Toutes les rangées ont `cantSplit: true` : la réglette ne doit jamais être coupée
// entre deux pages (une rangée ne peut pas se scinder ; vu la taille compacte d'une
// réglette, ça revient en pratique à garder toute la table sur une seule page).
function exBuildReglette(qId, C, pageW) {
  const { Table, TableRow, TableCell, Paragraph, TextRun, AlignmentType, BorderStyle, WidthType, VerticalAlign } = docx;
  const r = REGLETTES[qId];
  if (!r) return [];
  const { BORDER, BORDERS, CELL_MARGINS } = C;
  const RS = 12; // taille du texte des réglettes : 6 pt (demi-points docx)
  const cellText = (text, bold = false) => new TableCell({
    borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: 'Aptos', size: RS, bold })] })]
  });

  if (r.variante === '3 éléments — 2 liens') {
    const col1 = Math.floor(pageW * 0.22), col2 = Math.floor(pageW * 0.26), col3 = Math.floor(pageW * 0.35);
    const col4 = pageW - col1 - col2 - col3;
    const BN = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const BC2 = { top: BORDER, bottom: BORDER, left: BORDER, right: BN };
    const BC3 = { top: BORDER, bottom: BORDER, left: BN, right: BN };
    const BC4 = { top: BORDER, bottom: BORDER, left: BN, right: BORDER };
    const mk = (text, bold = false, rs = 1, cs = 1, w = 0, b = BORDERS) => new TableCell({
      borders: b, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
      rowSpan: rs > 1 ? rs : undefined, columnSpan: cs > 1 ? cs : undefined,
      width: w ? { size: w, type: WidthType.DXA } : undefined,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: 'Aptos', size: RS, bold })] })]
    });
    return [new Table({ width: { size: 0, type: WidthType.AUTO }, rows: [
      new TableRow({ cantSplit: true, children: [mk(r.oi, true, 6, 1, col1), mk("L'élève précise les trois éléments", false, 3, 1, col2, BC2), mk('et établit correctement deux liens de causalité.', false, 1, 1, col3, BC3), mk('3 points', false, 1, 1, col4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk('et établit correctement un lien de causalité.', false, 1, 1, col3, BC3), mk('2 points', false, 1, 1, col4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk("mais n'établit correctement aucun lien de causalité.", false, 1, 1, col3, BC3), mk('1 point', false, 1, 1, col4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk('L’élève précise deux éléments', false, 2, 1, col2, BC2), mk('et établit correctement un lien de causalité.', false, 1, 1, col3, BC3), mk('2 points', false, 1, 1, col4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk("mais n'établit correctement aucun lien de causalité.", false, 1, 1, col3, BC3), mk('1 point', false, 1, 1, col4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk("L'élève précise un seul élément ou n'en précise pas.", false, 1, 2, col2 + col3, BC2), mk('0 point', false, 1, 1, col4, BC4)] }),
    ]})];
  }

  if (r.variante === 'acteur-positions') {
    const c1 = Math.floor(pageW * 0.22), c2 = Math.floor(pageW * 0.43), c3 = Math.floor(pageW * 0.22), c4 = pageW - c1 - c2 - c3;
    const BN = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const BC2 = { top: BORDER, bottom: BORDER, left: BORDER, right: BN };
    const BC3 = { top: BORDER, bottom: BORDER, left: BN, right: BN };
    const BC4 = { top: BORDER, bottom: BORDER, left: BN, right: BORDER };
    const mk = (t, bold = false, rs = 1, cs = 1, w = 0, b = BORDERS) => new TableCell({
      borders: b, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
      rowSpan: rs > 1 ? rs : undefined, columnSpan: cs > 1 ? cs : undefined,
      width: w ? { size: w, type: WidthType.DXA } : undefined,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, font: 'Aptos', size: RS, bold })] })]
    });
    return [new Table({ width: { size: 0, type: WidthType.AUTO }, rows: [
      new TableRow({ cantSplit: true, children: [mk(r.oi, true, 5, 1, c1), mk("L'élève nomme correctement l'acteur qui présente une position différente", false, 4, 1, c2, BC2), mk('et présente correctement les deux positions.', false, 1, 1, c3, BC3), mk('3 points', false, 1, 1, c4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk("et présente correctement une position et plus ou moins correctement l'autre position.", false, 1, 1, c3, BC3), mk('2 points', false, 1, 1, c4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk("et présente plus ou moins correctement les deux positions, ou présente correctement une position et incorrectement l'autre ou ne la présente pas.", false, 1, 1, c3, BC3), mk('1 point', false, 1, 1, c4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk('et présente tout au plus une seule position plus ou moins correctement.', false, 1, 1, c3, BC3), mk('0 point', false, 1, 1, c4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk("L'élève nomme incorrectement l'acteur qui présente une position différente ou ne le nomme pas.", false, 1, 2, c2 + c3, BC2), mk('0 point', false, 1, 1, c4, BC4)] }),
    ]})];
  }

  if (r.variante === 'changement-continuité') {
    const c1 = Math.floor(pageW * 0.22), c2 = Math.floor(pageW * 0.37), c3 = Math.floor(pageW * 0.21), c4 = pageW - c1 - c2 - c3;
    const BN = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const BC2 = { top: BORDER, bottom: BORDER, left: BORDER, right: BN };
    const BC3 = { top: BORDER, bottom: BORDER, left: BN, right: BN };
    const BC4 = { top: BORDER, bottom: BORDER, left: BN, right: BORDER };
    const mk = (t, bold = false, rs = 1, cs = 1, w = 0, b = BORDERS) => new TableCell({
      borders: b, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER,
      rowSpan: rs > 1 ? rs : undefined, columnSpan: cs > 1 ? cs : undefined,
      width: w ? { size: w, type: WidthType.DXA } : undefined,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, font: 'Aptos', size: RS, bold })] })]
    });
    return [new Table({ width: { size: 0, type: WidthType.AUTO }, rows: [
      new TableRow({ cantSplit: true, children: [mk(r.oi, true, 6, 1, c1), mk("L'élève indique s'il y a changement ou continuité", false, 3, 1, c2, BC2), mk('et présente des faits qui le montrent correctement.', false, 1, 1, c3, BC3), mk('3 points (ou 2 points)', false, 1, 1, c4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk('et présente des faits qui le montrent plus ou moins correctement.', false, 1, 1, c3, BC3), mk('2 points (ou 1 point)', false, 1, 1, c4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk("et présente des faits qui le montrent incorrectement ou n'en présente pas.", false, 1, 1, c3, BC3), mk('0 point', false, 1, 1, c4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk("L'élève n'indique pas s'il y a changement ou continuité", false, 3, 1, c2, BC2), mk('mais présente des faits exacts.', false, 1, 1, c3, BC3), mk('2 points (ou 1 point)', false, 1, 1, c4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk('mais présente des faits plus ou moins exacts.', false, 1, 1, c3, BC3), mk('1 point (ou 0 point)', false, 1, 1, c4, BC4)] }),
      new TableRow({ cantSplit: true, children: [mk('et présente des faits inexacts ou n\'en présente pas.', false, 1, 1, c3, BC3), mk('0 point', false, 1, 1, c4, BC4)] }),
    ]})];
  }

  const niveaux = r.niveaux || [];
  if (!niveaux.length || !(r.colonnes || []).length) return [];
  const colOI = Math.floor(pageW * 0.22);
  const colW = Math.floor((pageW - colOI) / niveaux.length);
  const colLast = pageW - colOI - colW * (niveaux.length - 1);
  const cols = [colOI, ...niveaux.map((_, i) => (i === niveaux.length - 1 ? colLast : colW))];
  return [new Table({
    width: { size: pageW, type: WidthType.DXA }, columnWidths: cols,
    rows: [
      new TableRow({ cantSplit: true, children: [
        new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, rowSpan: 2,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.oi, font: 'Aptos', size: RS, bold: true })] })] }),
        ...r.colonnes.map(c => cellText(c))
      ]}),
      new TableRow({ cantSplit: true, children: niveaux.map(n => cellText(n.desc)) })
    ]
  })];
}

// ─────────────────────────────────────────────────────────────────────────────
// Espace réponse (porté depuis app.js genererDocx)
// ─────────────────────────────────────────────────────────────────────────────
function exBuildReponse(q, C, EllipseRun, imgR, pageW) {
  const { Table, TableRow, TableCell, Paragraph, TextRun, AlignmentType, BorderStyle, WidthType, VerticalAlign } = docx;
  const { BORDER, BORDERS, CELL_MARGINS } = C;
  const out = [];
  if (!q.reponse) return out;

  if (q.reponse === true) {
    out.push(new Paragraph({ children: [new TextRun({ text: '__________', font: 'Aptos', size: 22 })] }));
  } else if (q.reponse.type === 'image') {
    const imgData = imgR(q.reponse.ref);
    if (imgData && imgData.src) {
      const bytes = exB64ToBytes(imgData.src);
      if (bytes) {
        const ext = q.reponse.ref.split('.').pop().toLowerCase();
        const imgType = (ext === 'jpg' || ext === 'jpeg') ? 'jpg' : 'png';
        const w = Math.min(400, imgData.w);
        const h = Math.round(w / (imgData.w / imgData.h));
        out.push(new Paragraph({ alignment: AlignmentType.LEFT, children: [new docx.ImageRun({ data: bytes, type: imgType, transformation: { width: w, height: h } })] }));
      }
    }
  } else if (q.reponse.type === 'lignes') {
    const BN_L = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const BB_L = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
    const nb = q.reponse.nombre || 1;
    const mkRow = (first) => new TableRow({
      height: { value: 500, rule: 'exact' },
      children: [new TableCell({ borders: { top: (first && nb > 1) ? BB_L : BN_L, bottom: BB_L, left: BN_L, right: BN_L }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: ' ' })] })] })]
    });
    const rows = [];
    for (let i = 0; i < nb; i++) rows.push(mkRow(i === 0));
    if (!rows.length) rows.push(mkRow(true));
    out.push(new Table({ width: { size: pageW, type: WidthType.DXA }, columnWidths: [pageW], borders: { top: BN_L, bottom: BN_L, left: BN_L, right: BN_L, insideH: BN_L, insideV: BN_L }, rows }));
  } else if (q.reponse.type === 'tableau_2col') {
    const c2 = 1701;
    const mk2 = (t, bold = false) => new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width: { size: c2, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, font: 'Aptos', size: 20, bold })] })] });
    out.push(new Table({ width: { size: c2 * 2, type: WidthType.DXA }, columnWidths: [c2, c2], rows: [new TableRow({ children: [mk2('Réponse', true), mk2('')] })] }));
  } else if (q.reponse.type === 'grille') {
    const { entetes = [], rangees = [] } = q.reponse;
    if (entetes.length || rangees.length) {
      const nCols = entetes.length || (rangees[0] || []).length || 1;
      const gColW = Math.floor(pageW / nCols);
      const mkGCell = (text, bold) => new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ children: [new TextRun({ text: String(text || ''), font: 'Aptos', size: 20, bold: !!bold })] })] });
      const gRows = [
        ...(entetes.length ? [new TableRow({ children: entetes.map(h => mkGCell(h, true)) })] : []),
        ...rangees.map(row => new TableRow({ children: (row || []).map((cell, ci) => mkGCell(cell, ci === 0)) }))
      ];
      out.push(new Table({ width: { size: pageW, type: WidthType.DXA }, columnWidths: Array(nCols).fill(gColW), rows: gRows }));
    }
  } else if (q.reponse.type === 'cause-consequence') {
    const CIRC = 450000;
    const mkLbl = (text) => new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: 'Aptos', size: 20, bold: true })] })] });
    const mkCirc = () => { const p = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [] }); p.root.push(new EllipseRun(CIRC, CIRC)); return new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width: { size: 1134 * 2, type: WidthType.DXA }, children: [p] }); };
    out.push(new Table({ width: { size: 0, type: WidthType.AUTO }, rows: [
      new TableRow({ height: { value: 800, rule: 'atLeast' }, children: [mkLbl('Cause'), mkCirc()] }),
      new TableRow({ height: { value: 800, rule: 'atLeast' }, children: [mkLbl('Conséquence'), mkCirc()] }),
    ]}));
  } else if (q.reponse.type === 'mettre-en-relation' && (q.reponse.elements || []).length) {
    const CIRC = 450000;
    const els = q.reponse.elements || [];
    const n = els.length || 2;
    const colW = Math.floor(pageW / n);
    const colWidths = Array(n).fill(0).map((_, i) => (i === n - 1 ? pageW - colW * (n - 1) : colW));
    const mkLblCell = (text, w) => new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width: { size: w, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: 'Aptos', size: 20, bold: true })] })] });
    const mkCircCell = (w) => { const p = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [] }); p.root.push(new EllipseRun(CIRC, CIRC)); return new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width: { size: w, type: WidthType.DXA }, children: [p] }); };
    if (n === 2 && q.reponse.double) {
      const BNN = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
      const mkCircNR = (w) => { const p = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [] }); p.root.push(new EllipseRun(CIRC, CIRC)); return new TableCell({ borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BNN }, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width: { size: w, type: WidthType.DXA }, children: [p] }); };
      const mkCircNL = (w) => { const p = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [] }); p.root.push(new EllipseRun(CIRC, CIRC)); return new TableCell({ borders: { top: BORDER, bottom: BORDER, left: BNN, right: BORDER }, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width: { size: w, type: WidthType.DXA }, children: [p] }); };
      const mkEt = () => new TableCell({ borders: { top: BORDER, bottom: BORDER, left: BNN, right: BNN }, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'et', font: 'Aptos', size: 20 })] })] });
      out.push(new Table({ width: { size: 0, type: WidthType.AUTO }, rows: els.map(e => new TableRow({ height: { value: 800, rule: 'atLeast' }, children: [mkLblCell(e, 0), mkCircNR(1134 * 2), mkEt(), mkCircNL(1134 * 2)] })) }));
    } else if (n === 2) {
      out.push(new Table({ width: { size: 0, type: WidthType.AUTO }, rows: els.map(e => new TableRow({ height: { value: 800, rule: 'atLeast' }, children: [mkLblCell(e, 0), mkCircCell(1134 * 2)] })) }));
    } else {
      out.push(new Table({ width: { size: pageW, type: WidthType.DXA }, columnWidths: colWidths, rows: [
        new TableRow({ children: els.map((e, i) => mkLblCell(e, colWidths[i])) }),
        new TableRow({ height: { value: 800, rule: 'atLeast' }, children: colWidths.map(w => mkCircCell(w)) })
      ]}));
    }
  } else if (q.reponse.type === 'situer-dans-lespace') {
    const CIRC = 450000;
    const els = (q.reponse.elements || []).length ? q.reponse.elements : ['Élément 1', 'Élément 2'];
    const mkLbl = (text) => new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: 'Aptos', size: 20, bold: true })] })] });
    const mkCirc = () => { const p = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [] }); p.root.push(new EllipseRun(CIRC, CIRC)); return new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, children: [p] }); };
    out.push(new Table({ width: { size: 0, type: WidthType.AUTO }, rows: [
      new TableRow({ children: els.map(e => mkLbl(e)) }),
      new TableRow({ height: { value: 800, rule: 'atLeast' }, children: els.map(() => mkCirc()) })
    ]}));
  } else if (q.reponse.type === 'avant-apres') {
    const CIRC_EMU = 720000;
    const cMid = Math.floor(pageW * 0.38);
    const cSide = Math.floor((pageW - cMid) / 2);
    const etW = 680;
    const cCirc = Math.floor((cSide - etW) / 2);
    const cCircL = cSide - etW - cCirc;
    const BNN = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const mkCircCell = (w, bl, br) => { const p = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [] }); p.root.push(new EllipseRun(CIRC_EMU, CIRC_EMU)); return new TableCell({ borders: { top: BORDER, bottom: BORDER, left: bl, right: br }, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width: { size: w, type: WidthType.DXA }, children: [p] }); };
    const mkEtCell = (w) => new TableCell({ borders: { top: BORDER, bottom: BORDER, left: BNN, right: BNN }, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, width: { size: w, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'et', font: 'Aptos', size: 20, bold: true })] })] });
    const mkHdr = (text, cs, w) => new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, columnSpan: cs > 1 ? cs : undefined, width: { size: w, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: 'Aptos', size: 20, bold: true })] })] });
    out.push(new Table({ width: { size: pageW, type: WidthType.DXA }, columnWidths: [cCirc, etW, cCircL, cMid, cCirc, etW, cCircL], rows: [
      new TableRow({ children: [
        mkHdr('Avant', 3, cSide),
        new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, rowSpan: 2, width: { size: cMid, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: q.reponse.label || '', font: 'Aptos', size: 20, bold: true })] })] }),
        mkHdr('Après', 3, cSide),
      ]}),
      new TableRow({ height: { value: 1300, rule: 'atLeast' }, children: [
        mkCircCell(cCirc, BORDER, BNN), mkEtCell(etW), mkCircCell(cCircL, BNN, BORDER),
        mkCircCell(cCirc, BORDER, BNN), mkEtCell(etW), mkCircCell(cCircL, BNN, BORDER),
      ]}),
    ]}));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Téléchargement générique
// ─────────────────────────────────────────────────────────────────────────────
async function exSaveDocx(doc, filename, btnId) {
  const btn = document.getElementById(btnId);
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Génération…'; }
  try {
    const { Packer } = docx;
    const buffer = await Packer.toBlob(doc);
    const url = URL.createObjectURL(buffer);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast('Téléchargé : ' + filename, 'ok');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

function exSlug(periode) {
  return periode.replace(/^P(\d+).*$/, 'p$1');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Questionnaire : énoncés (docs renumérotés), espace réponse, réglette.
// ─────────────────────────────────────────────────────────────────────────────
async function exDownloadQuestionnaire() {
  if (!EX_SELECTION) return;
  try {
    await exEnsureDocx();
    const { Document, Paragraph, TextRun, AlignmentType } = docx;
    const C = exBuildConstants();
    const EllipseRun = exMakeEllipseRun();

    const children = [];
    const titre = (document.getElementById('ex-titre').value || ('Examen — ' + EX_PERIODE)).trim();
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: titre, font: 'Aptos', size: 28, bold: true })] }));
    const totalPts = EX_SELECTION.reduce((s, q) => s + q.points, 0);
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'Total : ' + totalPts + ' points', font: 'Aptos', size: 20, italics: true })] }));

    // Les images de réponse (type reponse.image) doivent être résolues avant la construction.
    const neededKeys = new Set();
    EX_SELECTION.forEach(q => { if (q.reponse && q.reponse.ref && IMAGE_DB[q.reponse.ref]) neededKeys.add(q.reponse.ref); });
    await exResolveImages([...neededKeys]);
    const imgR = k => _imgDocxCache[k] || IMAGE_DB[k];

    EX_SELECTION.forEach((q, idx) => {
      const { letterToNum } = EX_DOCMAP.byQuestion.get(q.id);
      const enonce = exRemapTexte(q.enonce || '', letterToNum);
      const lines = enonce.split('\n');
      // Retrait en accolade (hanging indent) : si l'énoncé s'étend sur 2 lignes, la 2ᵉ
      // ligne s'aligne sous le texte plutôt que de revenir à la marge de gauche.
      children.push(new Paragraph({ spacing: { before: 200 }, indent: { left: 284, hanging: 284 }, children: [new TextRun({ text: (idx + 1) + '.  ', font: 'Aptos', size: 24, bold: true }), ...exMkRuns(lines[0], 'Aptos', 24)] }));
      lines.slice(1).forEach(line => { if (line.trim()) children.push(exMkLine(line, 'Aptos', 24)); });
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));

      exBuildReponse(q, C, EllipseRun, imgR, EX_PAGE_W_Q).forEach(el => children.push(el));
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      exBuildReglette(q.id, C, EX_PAGE_W_Q).forEach(el => children.push(el));
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
    });

    const doc = new Document({ sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1134, right: 567, bottom: 1134, left: 567 } } }, children }] });
    await exSaveDocx(doc, 'questionnaire_' + exSlug(EX_PERIODE) + '.docx', 'btn-questionnaire');
  } catch (e) {
    console.error(e);
    toast('Erreur : ' + e.message, 'err');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Dossier documentaire : tous les documents, numérotés globalement, 2/rangée.
// ─────────────────────────────────────────────────────────────────────────────
async function exDownloadDossier() {
  if (!EX_SELECTION) return;
  try {
    await exEnsureDocx();
    const { Document, Table, TableRow, TableCell, Paragraph, TextRun, AlignmentType, WidthType, VerticalAlign } = docx;
    const C = exBuildConstants();
    const { BORDERS, CELL_MARGINS } = C;

    const items = EX_DOCMAP.docItems;
    const neededKeys = new Set();
    items.forEach(it => { if (it.col.ref && IMAGE_DB[it.col.ref]) neededKeys.add(it.col.ref); });
    const failed = await exResolveImages([...neededKeys]);
    if (failed.length) toast('Images introuvables dans le dossier : ' + failed.join(', '), 'err');
    const imgR = k => _imgDocxCache[k] || IMAGE_DB[k];

    const children = [];
    const titre = 'Dossier documentaire — ' + EX_PERIODE;
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: titre, font: 'Aptos', size: 28, bold: true })] }));

    const colW = Math.floor(EX_PAGE_W / 2);
    const makeCell = (item) => {
      const cellChildren = [];
      cellChildren.push(new Paragraph({ children: [new TextRun({ text: item.titre, font: 'Aptos', size: 20, bold: true, color: '1E1E64' })] }));
      const col = item.col;
      if (col.soustitre) cellChildren.push(new Paragraph({ children: [new TextRun({ text: col.soustitre, font: 'Aptos', size: 18, italics: true, color: '505050' })] }));
      if (col.ref) {
        const imgData = imgR(col.ref);
        if (imgData && imgData.src) {
          const bytes = exB64ToBytes(imgData.src);
          if (bytes) {
            const ext = col.ref.split('.').pop().toLowerCase();
            const imgType = (ext === 'jpg' || ext === 'jpeg') ? 'jpg' : 'png';
            const w = Math.min(260, imgData.w);
            const h = Math.round(w / (imgData.w / imgData.h));
            cellChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 }, children: [new docx.ImageRun({ data: bytes, type: imgType, transformation: { width: w, height: h } })] }));
          }
        }
      } else if (col.texte) {
        let texte = col.texte;
        if (!texte.startsWith('«')) texte = '« ' + texte + ' »';
        texte.split('\n').forEach(line => { cellChildren.push(exMkLine(line, 'Aptos', 19)); });
      }
      const meta = [col.auteur, col.source].filter(Boolean).join(' — ');
      if (meta) cellChildren.push(new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: meta, font: 'Aptos', size: 16, italics: true, color: '646464' })] }));
      return new TableCell({ width: { size: colW, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP, borders: BORDERS, margins: CELL_MARGINS, children: cellChildren });
    };

    for (let i = 0; i < items.length; i += 2) {
      const left = items[i];
      const right = items[i + 1];
      const rowCells = [makeCell(left)];
      rowCells.push(right ? makeCell(right) : new TableCell({ width: { size: colW, type: WidthType.DXA }, borders: { top: { style: docx.BorderStyle.NONE, size: 0 }, bottom: { style: docx.BorderStyle.NONE, size: 0 }, left: { style: docx.BorderStyle.NONE, size: 0 }, right: { style: docx.BorderStyle.NONE, size: 0 } }, children: [new Paragraph({ children: [new TextRun({ text: '' })] })] }));
      children.push(new Table({ width: { size: EX_PAGE_W, type: WidthType.DXA }, columnWidths: [colW, colW], rows: [new TableRow({ children: rowCells })] }));
      children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: '' })] }));
    }

    const doc = new Document({ sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }] });
    await exSaveDocx(doc, 'dossier_' + exSlug(EX_PERIODE) + '.docx', 'btn-dossier');
  } catch (e) {
    console.error(e);
    toast('Erreur : ' + e.message, 'err');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Guide de correction : réponse attendue (texte ou grille) par question.
// ─────────────────────────────────────────────────────────────────────────────
async function exDownloadGuide() {
  if (!EX_SELECTION) return;
  try {
    await exEnsureDocx();
    const { Document, Table, TableRow, TableCell, Paragraph, TextRun, AlignmentType, WidthType, VerticalAlign } = docx;
    const C = exBuildConstants();
    const { BORDERS, CELL_MARGINS } = C;

    const children = [];
    const titre = 'Guide de correction — ' + EX_PERIODE;
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: titre, font: 'Aptos', size: 28, bold: true })] }));

    EX_SELECTION.forEach((q, idx) => {
      children.push(new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: (idx + 1) + '.', font: 'Aptos', size: 22, bold: true })] }));
      const { letterToNum } = EX_DOCMAP.byQuestion.get(q.id);
      if (!q.guide) {
        children.push(new Paragraph({ children: [new TextRun({ text: '—', font: 'Aptos', size: 20 })] }));
        return;
      }
      if (typeof q.guide === 'string') {
        const remapped = exRemapTexte(q.guide, letterToNum);
        remapped.split('\n').forEach(line => { children.push(exMkLine(line, 'Aptos', 20)); });
      } else if (q.guide.type === 'grille' || q.guide.type === 'tableau') {
        const mkGCell = (text, bold) => new TableCell({ borders: BORDERS, margins: CELL_MARGINS, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ children: [new TextRun({ text: String(text || ''), font: 'Aptos', size: 20, bold: !!bold })] })] });
        let headers, rows;
        if (q.guide.type === 'grille') { headers = q.guide.entetes || []; rows = q.guide.rangees || []; }
        else { headers = ['', 'Document']; rows = (q.guide.lignes || []).map(l => [l.label, l.valeur]); }
        const nCols = headers.length || 2;
        const colW = Math.floor(EX_PAGE_W / nCols);
        const guideRows = [
          new TableRow({ children: headers.map(h => mkGCell(h, true)) }),
          ...rows.map(row => new TableRow({ children: row.map((cell, ci) => mkGCell(cell, ci === 0)) }))
        ];
        children.push(new Table({ width: { size: EX_PAGE_W, type: WidthType.DXA }, columnWidths: Array(nCols).fill(colW), rows: guideRows }));
      }
    });

    const doc = new Document({ sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }] });
    await exSaveDocx(doc, 'guide_' + exSlug(EX_PERIODE) + '.docx', 'btn-guide');
  } catch (e) {
    console.error(e);
    toast('Erreur : ' + e.message, 'err');
  }
}
