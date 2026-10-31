import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const nodes={},listeners={},dialogs=[];let observer,stored;
const document={activeElement:null,getElementById:id=>nodes[id]||null,
 addEventListener(k,f,capture){(listeners[k]??=[]).push(f);},
 querySelector:()=>dialogs.find(d=>d.open)||null,
 body:{appendChild(n){if(n.tag==='dialog')dialogs.push(n);n.isConnected=true;}},
 createElement:tag=>element(tag)};
function element(tag='div') {
 const classes=new Set();return {tag,type:'text',value:'',checked:false,isConnected:true,style:{display:'none'},children:[],events:{},
  classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},
  addEventListener(k,f){this.events[k]=f;},setAttribute(){},getClientRects:()=>[{}],closest:()=>null,
  append(...children){this.children.push(...children);},appendChild(n){this.children.push(n);},
  querySelectorAll(){return this.children.filter(c=>c.tag==='button');},contains(n){return n===this||this.children.includes(n);},
  focus(){document.activeElement=this;},showModal(){this.open=true;},close(v){this.returnValue=v;this.open=false;this.events.close?.();},remove(){this.isConnected=false;this.open=false;}};
}
for(const id of ['exam-nom','exam-eleve','exam-groupe','exam-date','exam-score','exam-commentaires','exam-sources-images','exam-titres-documents']) {nodes[id]=element('input');nodes[id].type=id==='exam-nom'?'text':'checkbox';}
for(const id of ['q-modal-overlay','preview-modal','continuum-modal','cahier-panel','lightbox','text-zoom-overlay','exam-overlay']){nodes[id]=element();nodes[id].append(element('button'),element('button'));}
const opener=element('button');document.activeElement=opener;
const context={document,console,Object,localStorage:{getItem:()=>JSON.stringify({'exam-nom':'Évaluation','exam-sources-images':false}),setItem:(_k,v)=>stored=v},
 MutationObserver:class {constructor(fn){observer=fn;}observe(){}},closeLightbox(){nodes.lightbox.classList.remove('open');}};
vm.createContext(context);vm.runInContext(fs.readFileSync(root+'main-ui.js','utf8'),context);
const ui=vm.runInContext('GHECMain',context);
assert.equal(nodes['exam-nom'].value,'Évaluation');assert.equal(nodes['exam-sources-images'].checked,false);
nodes['exam-date'].checked=true;nodes['exam-date'].events.input();assert.equal(JSON.parse(stored)['exam-date'],true);
for(const choice of ['retry','continue','cancel']){const pending=ui.missingImages(['image.jpg']);dialogs.at(-1).close(choice);assert.equal(await pending,choice);}
nodes['q-modal-overlay'].classList.add('open');observer();assert.equal(document.activeElement,nodes['q-modal-overlay'].children[0]);
nodes.lightbox.classList.add('open');observer();assert.equal(document.activeElement,nodes.lightbox.children[0]);
listeners.keydown[0]({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});observer();assert.equal(document.activeElement,nodes['q-modal-overlay'].children[0]);
nodes['q-modal-overlay'].classList.remove('open');observer();assert.equal(document.activeElement,opener);
console.log('✓ Main : préférences, trois choix pour les images, focus des fenêtres imbriquées et retour au contrôle initial.');
