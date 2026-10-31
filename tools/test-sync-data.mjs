import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const sandbox={console,setTimeout,clearTimeout,AbortController,TextDecoder,TextEncoder,atob,btoa};vm.createContext(sandbox);
for(const f of ['questions-io.js','sync-data.js'])vm.runInContext(fs.readFileSync(root+f,'utf8'),sandbox);
const sync=vm.runInContext('GHECSync',sandbox);
const state=(qs,extra={})=>({QUESTIONS:qs,REGLETTES:{},IMAGE_DB:extra});
const base=state([{id:'Q1',enonce:'Ancien',guide:'Réponse'},{id:'Q2',enonce:'Autre'}]);
const local=sync.clone(base);local.QUESTIONS[0].enonce='Nouveau';
const remote=sync.clone(base);remote.QUESTIONS[0].guide='Réponse précisée';remote.QUESTIONS.pop();
const merged=sync.mergeState(base,local,remote);
assert.equal(merged.QUESTIONS.length,1);assert.equal(merged.QUESTIONS[0].guide,'Réponse précisée');assert.equal(merged.QUESTIONS[0].enonce,'Nouveau');
remote.QUESTIONS[0].enonce='Modification concurrente';assert.throws(()=>sync.mergeState(base,local,remote),/Conflit/);
assert.throws(()=>sync.mergeState(base,local,state([])),/Conflit/);
assert.equal(sync.mergeState(base,base,state([])).QUESTIONS.length,0);
const json=value=>({ok:true,json:async()=>value});
let changing=0;
sandbox.fetch=async url=>url.includes('/git/ref/')?json({object:{sha:'c'+(++changing)}}):json({sha:'blob',content:btoa('const QUESTIONS=[];const REGLETTES={};const IMAGE_DB={};')});
await assert.rejects(sync.stableRead({}, {maxWait:10,poll:0}),/Aucune écriture/);
let current=sync.clone(base),sha='q0',commit='c0',puts=[],index='const QUESTIONS=[];',indexSha='i0';
sandbox.fetch=async(url,opts={})=>{
 if(url.includes('/git/ref/'))return json({object:{sha:commit}});
 if(opts.method==='PUT') {
  const body=JSON.parse(opts.body);puts.push(body);
  if(url.endsWith('/questions-index.js')){index=Buffer.from(body.content,'base64').toString();indexSha='i1';commit='c2';return json({content:{sha:indexSha}});}
  current=sync.parse(Buffer.from(body.content,'base64').toString());sha='q1';commit='c1';return json({content:{sha}});
 }
 if(url.includes('/questions-index.js?'))return json({sha:indexSha,content:Buffer.from(index).toString('base64')});
 return json({sha,content:Buffer.from(sandbox.generateQuestionsJs(current.QUESTIONS,current.REGLETTES,current.IMAGE_DB)).toString('base64')});
};
const saved=await sync.edit({base,headers:{},message:'Test',mutate:s=>{s.QUESTIONS[0].enonce='Modifié';}});assert.equal(saved.state.QUESTIONS[0].enonce,'Modifié');
await sync.publishIndex({},'Test');assert.equal(puts.length,2);assert.equal(new Function(index+';return QUESTIONS')()[0].enonce,'Modifié');
console.log('✓ Synchronisation : suppressions respectées, conflits refusés, champs distincts fusionnés, lectures instables bloquées et index actuel.');
