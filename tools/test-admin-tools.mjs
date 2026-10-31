import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const nodes={},storage=new Map(),listeners={};
function el(){return {value:'',textContent:'',children:[],hidden:true,addEventListener(){},replaceChildren(){this.children=[];},appendChild(n){this.children.push(n);}};}
for(const id of ['draft-status','draft-select','admin-drafts','publish-status'])nodes[id]=el();
const sandbox={console,Date,JSON,setTimeout,clearTimeout,confirm:()=>true,alert:()=>{},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 document:{getElementById:id=>nodes[id]||null,createElement:el,querySelector:()=>el(),addEventListener(k,f){listeners[k]=f;}},
 window:{addEventListener(k,f){listeners[k]=f;}}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(root+'admin-tools.js','utf8'),sandbox);
const api=vm.runInContext('GHECAdmin',sandbox);
const q={id:'Q1',enonce:'Observe les documents A à C.',documents:[{type:'textes',cols:[{titre:'Document A',ref:'a.jpg'},{titre:'Document C',texte:'Texte'}]}],guide:'  '};
let warnings=api.warnings(q,[],{'a.jpg':{}});assert(warnings.some(w=>w.includes('B.')));assert(warnings.some(w=>w.includes('réponse attendue')));
assert(!warnings.some(w=>w.includes('Images absentes')));
assert(api.warnings({...q,guide:{rangees:[['','']]}},[],{}).some(w=>w.includes('réponse attendue')));
assert(api.warnings({...q,enonce:'Question identique',guide:'Réponse'},[{id:'Q2',enonce:'Question identique!'}],{}).some(w=>w.includes('Q2')));
assert(!api.warnings({...q,enonce:'Autre question',guide:'Réponse'},[{id:'Q1',enonce:'Autre question'}],{'a.jpg':{}}).some(w=>w.includes('Énoncé')));
let dirty=true,restored;
const draft={version:1,editingId:'Q1',fields:[{id:'q-id',value:'Q1'},{id:'q-enonce',value:'  Texte incomplet\n'}],documents:[],response:[],guide:[]};
api.init({capture:()=>draft,restore:s=>restored=s,dirty:()=>dirty,markDirty:()=>dirty=true,clean:()=>dirty=false});
api.save();let saved=JSON.parse(storage.get('ghec_admin_drafts_v1'));assert.equal(saved['edit:Q1'].fields[1].value,'  Texte incomplet\n');
assert(!storage.has('gh_token'));assert(!storage.has('workerSecret'));
nodes['draft-select'].value='edit:Q1';api.restoreSelected();assert.equal(restored.editingId,'Q1');assert(dirty);
api.published('Q1');assert.equal(Object.keys(JSON.parse(storage.get('ghec_admin_drafts_v1'))).length,0);assert(!dirty);
const configTest={};vm.createContext(configTest);
const html=fs.readFileSync(root+'admin.html','utf8');const start=html.indexOf('async function _putFileWithRetry(');const end=html.indexOf('\n}',start)+2;
vm.runInContext("const cfgLoadedSources={'contexte.js':'ancienne'};const OWNER='x',REPO='x',BRANCH='main';const getToken=()=> 'test';const utf8b64=x=>x;"+html.slice(start,end),configTest);
let puts=0;configTest._fetchFileRaw=async()=>({sha:'s',content:'nouvelle'});configTest.fetch=async()=>{puts++;return {ok:true};};
await assert.rejects(configTest._putFileWithRetry('contexte.js','Test',()=> 'local'),/modifiée ailleurs/);assert.equal(puts,0);
console.log('✓ Admin : citations manquantes, guide vide, doublons, brouillon incomplet/restauré/retiré et conflit de configuration avant écriture.');
