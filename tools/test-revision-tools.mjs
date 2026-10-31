import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const nodes={},storage=new Map(),events={};
function option(value){return {value,textContent:value,cloneNode(){return option(value);}};}
function element(id='') {return {id,value:'',type:'text',textContent:'',children:[],childNodes:[],tagName:'SELECT',disabled:false,isConnected:true,
  style:{},classList:{add(){},remove(){}},addEventListener(k,f){events[id+':'+k]=f;},setAttribute(){},focus(){},closest:()=>true,
  appendChild(node){this.children.push(node);},replaceChildren(...nodes){this.childNodes=nodes;this.children=nodes;},querySelectorAll:()=>[]};}
for(const id of ['f-niveau','f-competence','f-periode','f-aspect','f-oi','f-search','rv-draft-select','rv-draft-status','rv-card-wrap','rv-card'])nodes[id]=element(id);
nodes['f-search'].tagName='INPUT';
const sandbox={navigator:{},console,Date,JSON,setTimeout,clearTimeout,AbortController,TextDecoder,TextEncoder,atob,btoa,alert(){},confirm:()=>false,
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 window:{addEventListener(){}},document:{getElementById:id=>nodes[id]||(nodes[id]=element(id)),createElement:()=>element(),querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}}};
vm.createContext(sandbox);
for(const f of ['oi-config.js','contexte.js','competences.js','questions-io.js','sync-data.js','revision-tools.js'])vm.runInContext(fs.readFileSync(root+f,'utf8'),sandbox);
const tools=vm.runInContext('GHECRevision',sandbox);
const guide={type:'grille',entetes:['Élément','Document'],rangees:[['Maïs','A']],note:'conservée'};
const grid=tools.matrix(guide);grid.rows[0][1]='B';const changed=tools.fromMatrix(guide,grid.headers,grid.rows);assert.equal(changed.rangees[0][1],'B');assert.equal(changed.note,'conservée');assert.equal(guide.rangees[0][1],'A');
const legacy={type:'tableau',lignes:[{label:'Avant',valeur:0,extra:true}]};const matrix=tools.matrix(legacy);assert.equal(matrix.rows[0][1],0);matrix.rows[0][1]='Après';assert.equal(tools.fromMatrix(legacy,matrix.headers,matrix.rows).lignes[0].extra,true);
const html=fs.readFileSync(root+'revision.html','utf8');const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n').replace('initRevisionTools();\nrvLoadQuestions();','');vm.runInContext(inline,sandbox);
for(const id of ['f-niveau','f-competence','f-periode','f-aspect','f-oi']){nodes[id].value='avant';nodes[id].childNodes=[option('avant')];}
nodes['f-search'].value='ancien texte';sandbox.rvRememberFilters();nodes['f-niveau'].value='après';nodes['f-periode'].childNodes=[option('nouvelle société')];nodes['f-search'].value='nouveau texte';
vm.runInContext("_rvActiveEdit={id:'Q1',key:'enonce',isDirty:()=>true,baseQuestion:{id:'Q1',enonce:'Version ouverte'}};",sandbox);
sandbox.rvApplyFilters();assert.equal(nodes['f-niveau'].value,'avant');assert.equal(nodes['f-periode'].childNodes[0].value,'avant');assert.equal(nodes['f-search'].value,'ancien texte');
let draft={version:1,id:'Q1',key:'guide',baseQuestion:{id:'Q1',guide},fields:[{id:'rvg-0-1',value:' C '}]},restored;
tools.init({capture:()=>draft,restore:d=>restored=d,dirty:()=>true,canRestore:()=>true});tools.save();nodes['rv-draft-select'].value='Q1|guide';tools.restore();assert.equal(restored.fields[0].value,' C ');tools.saved('Q1','guide');assert.equal(Object.keys(JSON.parse(storage.get('ghec_revision_drafts_v1'))).length,0);
assert(!storage.has('gh_token'));assert(!storage.has('workerSecret'));
let captured;sandbox.rvRequireToken=()=> 'test';vm.runInContext("rvConfirmedQuestions=[{id:'Q1',enonce:'Version distante'}]",sandbox);
vm.runInContext("GHECSync.edit=async options=>{globalThis.capturedBase=options.base;return null};GHECSync.finishIndex=async()=>{}",sandbox);
await sandbox.rvApplyQuestionsEdit(()=>false,'Test');assert.equal(sandbox.capturedBase.QUESTIONS[0].enonce,'Version ouverte');
vm.runInContext('_rvActiveEdit=null',sandbox);
sandbox.rvPopulateFilters=()=>{};sandbox.rvApplyFilters=()=>{};
vm.runInContext("GHECSync.readFile=async()=>{throw Error('réseau')};GHECSync.request=async()=>{throw Error('hors ligne')}",sandbox);
await sandbox.rvLoadQuestions();assert(nodes['rv-load-status'].textContent.includes('Chargement impossible'));assert.equal(nodes['rv-load-status'].children.at(-1).textContent,'Réessayer');
vm.runInContext("GHECSync.request=async()=> 'const QUESTIONS=[{id:\"Q7\",enonce:\"Test\"}];const REGLETTES={};const IMAGE_DB={};'",sandbox);
await sandbox.rvLoadQuestions();assert.equal(vm.runInContext('QUESTIONS[0].id',sandbox),'Q7');assert(nodes['rv-load-status'].textContent.includes('secours'));
sandbox.window=sandbox;sandbox.addEventListener=()=>{};
sandbox.initRevisionTools();
vm.runInContext("rvList=[{id:'Q1',enonce:'Ancien'},{id:'Q2',enonce:'Autre'}];rvIndex=0;_rvActiveEdit=null",sandbox);
sandbox.rvEditEnonce();nodes['rv-enonce-textarea'].value='Nouveau';let release;
sandbox.rvApplyQuestionsEdit=()=>new Promise(resolve=>release=resolve);
const pending=sandbox.rvSaveEnonce();assert(vm.runInContext('rvSaving',sandbox));sandbox.rvNav(1);assert.equal(vm.runInContext('rvIndex',sandbox),0);release(true);await pending;assert(!vm.runInContext('rvSaving',sandbox));assert.equal(vm.runInContext('rvList[0].enonce',sandbox),'Nouveau');
sandbox.rvEditEnonce();nodes['rv-enonce-textarea'].value='Texte à récupérer';sandbox.rvApplyQuestionsEdit=async()=>{throw Error('réseau indisponible')};await sandbox.rvSaveEnonce();assert(vm.runInContext('hasUnsavedEdit()',sandbox));assert.equal(nodes['rv-enonce-textarea'].value,'Texte à récupérer');assert(nodes['rv-enonce-status'].textContent.includes('réseau indisponible'));
console.log('✓ Révision : tableaux et métadonnées conservés, zéro préservé, filtres restaurés après annulation, brouillon récupérable et base de conflit liée à l’édition.');
