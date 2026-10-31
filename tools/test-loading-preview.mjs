import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const elements = {};
function element() { return {hidden:true,style:{},dataset:{},offsetHeight:300,events:{},addEventListener(k,f){this.events[k]=f},setAttribute(){},removeAttribute(){},contains(){return false},classList:{add(){},remove(){}}}; }
const sandbox = {console:{...console,error(){}},setTimeout,clearTimeout,AbortController,TextDecoder,atob,
  document:{getElementById:id=>elements[id]||null,addEventListener(){},createElement:element,body:{appendChild:e=>elements[e.id]=e}},
  window:{innerWidth:1400,innerHeight:900,matchMedia:()=>({matches:true}),addEventListener(){}},localStorage:{getItem:()=>null}};
vm.createContext(sandbox);
for(const f of ['oi-config.js','contexte.js','sync-data.js','app.js']) vm.runInContext(fs.readFileSync(root+f,'utf8'),sandbox);
let aborted=false;
sandbox.fetch=(_url,opts)=>{opts.signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});};
await assert.rejects(sandbox.fetchQuestionData('test','text',10),/délai/);
assert(aborted);
sandbox.fetch=async()=>({ok:true,text:()=>new Promise(()=>{})});
await assert.rejects(sandbox.fetchQuestionData('test','text',10),/délai/);
vm.runInContext("const QUESTIONS=[{id:'Q99'}];populateFilters=()=>{Q_MAP=new Map(QUESTIONS.map(q=>[q.id,q]))};applyFilters=()=>{};updatePanierBar=()=>{}",sandbox);
let urls=[];
sandbox.fetch=async url=>{urls.push(url);if(url.startsWith('https:'))throw Error('API hors ligne');return {ok:true,text:async()=>"const QUESTIONS=[{id:'Q1',enonce:'Une question',documents:[]}];const IMAGE_DB={};const REGLETTES={};"};};
await sandbox.ensureDataLoaded();assert.equal(urls.length,2);assert(urls[1].startsWith('questions.js?'));
assert.equal(sandbox.cahierDocumentTitle({titre:'Document A',titreWeb:true,titreDocx:false},'tableau',true),'');
assert.equal(sandbox.cahierDocumentTitle({titre:'Document A',titreWeb:false,titreDocx:true},'tableau',true),'Document A');
assert.equal(sandbox.cahierDocumentTitle({titre:'Document A'},'textes',false),'');
const tile=id=>({...element(),id:'tile-'+id,isConnected:true,getBoundingClientRect:()=>({left:100,right:400,top:100})});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
sandbox.scheduleTilePreview(tile('Q1'));await wait(380);
const panel=elements['tile-preview'];assert(panel.innerHTML.includes('Une question'));
sandbox.leaveTilePreview();sandbox.scheduleTilePreview(tile('Q2'));assert(!panel.hidden);await wait(100);panel.events.mouseenter();await wait(680);assert(!panel.hidden);assert(panel.innerHTML.includes('Une question'));
sandbox.hideTilePreview();
for(const id of ['btn-generer','btn-generer-guide'])elements[id]=element();
vm.runInContext("panier=['Q1'];ensureDataLoaded=async()=>{throw new Error('réseau indisponible')};showWarn=msg=>{globalThis.warning=msg}",sandbox);
await sandbox.genererDocx(false);assert.match(sandbox.warning,/réseau indisponible/);assert.equal(elements['btn-generer'].disabled,false);assert.equal(elements['btn-generer-guide'].disabled,false);
console.log('✓ Délais réseau et corps, repli statique, titres, passage vers aperçu, erreur Word et boutons.');
