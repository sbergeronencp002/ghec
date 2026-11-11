#!/usr/bin/env python3
"""Export GHEC3 depuis la banque courante du dépôt, avec les illustrations d'origine."""
import json, subprocess, io, os, re, zipfile
from pathlib import Path
from PIL import Image
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

root=Path(__file__).resolve().parent.parent
js=(root/'questions.js').read_text(encoding='utf-8')
node="const fs=require('fs');const src=fs.readFileSync('questions.js','utf8');eval(src+';process.stdout.write(JSON.stringify({questions:QUESTIONS,reglettes:REGLETTES}))');"
raw=subprocess.check_output(['node','-e',node],cwd=str(root))
data=json.loads(raw)
items=[x for x in data['questions'] if x.get('niveau')==3]
reglettes=data['reglettes']
assert len(items)>=100, f'Nombre inattendu de questions GHEC3: {len(items)}'
sections=[
    ('Iroquoiens vers 1500', lambda x: not any(t in x.get('periodes',[]) for t in ['Algonquiens vers 1500','Incas vers 1500','Iroquoiens vers 1745'])),
    ('Iroquoiens et Algonquiens vers 1500',lambda x:'Algonquiens vers 1500' in x.get('periodes',[])),
    ('Iroquoiens et Incas vers 1500',lambda x:'Incas vers 1500' in x.get('periodes',[])),
    ('Société iroquoienne entre 1500 et 1745',lambda x:'Iroquoiens vers 1745' in x.get('periodes',[])),
]
groups=[[x for x in items if pred(x)] for _,pred in sections]
assert sum(map(len,groups))==len(items)
assert len(set(x['id'] for x in items))==len(items)

document=Document()
sec=document.sections[0]
sec.page_height=Cm(29.7);sec.page_width=Cm(21)
sec.top_margin=Cm(1);sec.bottom_margin=Cm(1)
sec.left_margin=Cm(1);sec.right_margin=Cm(1)
sec.header_distance=Cm(.45);sec.footer_distance=Cm(.45)
styles=document.styles
norm=styles['Normal'];norm.font.name='Aptos';norm.font.size=Pt(9)
norm.paragraph_format.space_after=Pt(3)
for nm,size in [('Titre question',15),('Libellé',9)]:
    if nm not in styles: styles.add_style(nm,WD_STYLE_TYPE.PARAGRAPH)
styles['Titre question'].font.name='Aptos Display';styles['Titre question'].font.size=Pt(size if nm=='Titre question' else 9)
styles['Titre question'].font.bold=True
styles['Libellé'].font.bold=True
styles['Libellé'].font.size=Pt(9)

def para(text='',bold=False,size=None):
    p=document.add_paragraph();r=p.add_run(str(text));r.bold=bold
    if size:r.font.size=Pt(size)
    return p
def label(txt):
    p=document.add_paragraph(style='Libellé');p.paragraph_format.space_before=Pt(5);p.add_run(txt)
def set_cell(cell,txt,size=8):
    cell.text=''
    p=cell.paragraphs[0];p.paragraph_format.space_after=Pt(1)
    r=p.add_run(str(txt));r.font.size=Pt(size)
def figure(cell, col, img_cm):
    title=col.get('titre') or 'Document'
    set_cell(cell,title,8)
    for pp in cell.paragraphs: pp.paragraph_format.space_after=Pt(1)
    ref=col.get('ref') or ''
    path=root/'images'/ref
    if ref and path.exists():
        try:
            with Image.open(path) as im:
                iw,ih=im.size
            maxw=img_cm;maxh=4.9 if img_cm<=6.4 else 7.0
            w=min(maxw,maxh*iw/ih)
            p=cell.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER;p.paragraph_format.space_after=Pt(1)
            p.add_run().add_picture(str(path),width=Cm(w))
            embedded.append(str(path.relative_to(root)))
        except Exception as exc:
            set_cell(cell,'[Image non intégrée : '+ref+']',8);missing.append(ref)
    elif ref:
        set_cell(cell,'[Image introuvable : '+ref+']',8);missing.append(ref)
    if col.get('soustitre'):
        p=cell.add_paragraph(str(col['soustitre']));p.paragraph_format.space_after=Pt(1)
        for run in p.runs:run.font.size=Pt(7.5)
    if col.get('source'):
        p=cell.add_paragraph(str(col['source']));p.paragraph_format.space_after=Pt(1)
        for run in p.runs:run.font.size=Pt(6.5)
def make_docs(docs):
    cols=[c for d in docs for c in d.get('cols',[])]
    if not cols:
        para('Aucun document associé dans la banque.',size=8);return
    columns=1 if len(cols)==1 else 2
    t=document.add_table(rows=(len(cols)+columns-1)//columns,cols=columns)
    t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
    for idx,c in enumerate(cols):
        cell=t.cell(idx//columns,idx%columns)
        cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.TOP
        figure(cell,c,9.0 if columns==1 else 6.2)
def answer(x):
    g=x.get('guide')
    if isinstance(g,str): para(g.strip() or 'Aucun corrigé renseigné.')
    elif isinstance(g,dict):
        if g.get('type')=='grille':
            heads=g.get('entetes',[]);rows=g.get('rangees',[])
            if heads:
                tab=document.add_table(rows=1,cols=len(heads))
                tab.style='Table Grid'
                for i,h in enumerate(heads):set_cell(tab.rows[0].cells[i],h,8)
                for row in rows:
                    cells=tab.add_row().cells
                    for i,cell in enumerate(cells):set_cell(cell,row[i] if i<len(row) else '',9)
            else:para(json.dumps(g,ensure_ascii=False))
        else:para(json.dumps(g,ensure_ascii=False))
    else:para('Aucun corrigé renseigné.')
def reglette(x):
    r=reglettes.get(x['id'])
    if not r or not r.get('niveaux'):
        para('Aucune réglette enregistrée pour cette question.',size=8)
        return
    levels=r['niveaux']
    columns=len(levels)
    tab=document.add_table(rows=2,cols=columns)
    tab.autofit=False
    tab.style='Table Grid'
    for i,lev in enumerate(levels):
        c=tab.cell(0,i)
        set_cell(c,(r.get('colonnes') or [])[i] if i<len(r.get('colonnes') or []) else str(lev.get('pts',''))+' point(s)',8)
        for run in c.paragraphs[0].runs:
            run.bold=True
        c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
        c=tab.cell(1,i)
        set_cell(c,lev.get('desc',''),7.5)
        c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.TOP

embedded=[];missing=[]
total=sum(len(g) for g in groups);index=0
for group_name, qs in zip([a for a,_ in sections],groups):
    qs.sort(key=lambda x:int(x['id'].lstrip('Q')))
    for x in qs:
        index+=1
        p=document.add_paragraph()
        p.paragraph_format.space_after=Pt(1)
        r=p.add_run(group_name.upper());r.bold=True;r.font.size=Pt(8);r.font.color.rgb=RGBColor(90,90,90)
        p=document.add_paragraph(style='Titre question');p.paragraph_format.space_after=Pt(5)
        p.add_run('Question '+x['id'])
        tab=document.add_table(rows=3,cols=2);tab.autofit=False
        set_cell(tab.cell(0,0),'OI',8);set_cell(tab.cell(0,1),x.get('oi',''),9)
        set_cell(tab.cell(1,0),'Aspect',8)
        set_cell(tab.cell(1,1),', '.join(a.get('aspect','') for a in x.get('aspects',[])),9)
        set_cell(tab.cell(2,0),'Tags',8)
        tags=[]
        for raw_tag in [x.get('soustag'),x.get('tag'),x.get('tags')]:
            if isinstance(raw_tag,str) and raw_tag.strip():
                tags.append(raw_tag.strip())
            elif isinstance(raw_tag,list):
                tags.extend(str(t).strip() for t in raw_tag if str(t).strip())
        set_cell(tab.cell(2,1), ' · '.join(dict.fromkeys(tags)) if tags else '—',8.5)
        tab.columns[0].width=Cm(2);tab.columns[1].width=Cm(16.5)
        label('Question')
        para(x.get('enonce',''))
        label('Documents')
        make_docs(x.get('documents',[]))
        if x.get('reponse',{}).get('type')=='image' and x['reponse'].get('ref'):
            label('Support de réponse')
            r=x['reponse']['ref'];path=root/'images'/r
            if path.exists():
                p=document.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
                p.add_run().add_picture(str(path),width=Cm(8))
                embedded.append(str(path.relative_to(root)))
            else:para('Image de support introuvable : '+r)
        label('Réponses')
        answer(x)
        label("Réglette d’évaluation")
        reglette(x)
        if index<total: document.add_page_break()

out=root/'GHEC3_questions_documents_reponses_tags_reglettes.docx'
document.save(out)
with zipfile.ZipFile(out) as z:
    media=[p for p in z.namelist() if p.startswith('word/media/')]
assert media, 'Export sans images!'
assert len([x for x in items if x['id'] in reglettes]) == len(items), "Réglettes manquantes"
print(json.dumps({'filename':out.name,'questions':total,'groups':dict(zip([x[0] for x in sections],[len(g) for g in groups])),'images_embedded':len(embedded),'unique_media':len(media),'missing_images':sorted(set(missing))},ensure_ascii=False))
