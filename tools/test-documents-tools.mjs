import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('documents-tools.js','utf8');
function load(sync) { const ctx=vm.createContext({GHECSync:sync}); vm.runInContext(source+';globalThis.api=GHECDocuments',ctx); return ctx.api; }
const api=load({});
const questions=[{id:'Q1',documents:[{ref:'a.png'},{cols:[{ref:'a.png'},{ref:'b.jpg'}]}],reponse:{ref:'a.png'}},{id:'Q2',documents:[{ref:'a.png'}]}];
assert.deepEqual([...api.users(questions,'a.png')],['Q1','Q2']);
api.renameRefs([questions[0]],'a.png','copy.png');
assert.equal(questions[0].documents[0].ref,'copy.png');
assert.equal(questions[0].documents[1].cols[0].ref,'copy.png');
assert.equal(questions[0].reponse.ref,'copy.png');
assert.equal(questions[1].documents[0].ref,'a.png');
assert.equal(questions[0].documents[1].cols[1].ref,'b.jpg');
let active=0,peak=0;
await api.pool([1,2,3,4,5,6],2,async()=>{ active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--; });
assert.equal(peak,2);
async function deletion({used=false,code=false,concurrent=false}={}) {
 const writes=[];
 const sync={
  stableRead:async()=>({content:'data',commit:'original'}),parse:()=>({QUESTIONS:used?[{id:'Q7',reponse:{ref:'a.png'}}]:[]}),
  readFile:async(path,headers,ref)=>{assert.equal(ref,'original');return {content:code?'images/a.png':'safe'};},
  request:async(url,options={})=>{
   if(options.method){const body=JSON.parse(options.body);writes.push({url,body}); if(options.method==='PATCH'&&concurrent)throw Error('non fast-forward');return {sha:'next'};}
   if(url.includes('git/commits/'))return {tree:{sha:'tree'}};
   if(url.includes('git/trees/'))return {tree:[{path:'images/a.png',type:'blob'},{path:'index.html',type:'blob'}]};
   throw Error(url);
  }
 };
 let error; try{await load(sync).deleteUnused('a.png',{});}catch(e){error=e;}
 return {writes,error};
}
assert.equal((await deletion({used:true})).writes.length,0);
assert.equal((await deletion({code:true})).writes.length,0);
let result=await deletion();assert.equal(result.error,undefined);
assert.equal(result.writes.length,3);
assert.equal(result.writes[0].body.tree.length,1);
assert.equal(result.writes[0].body.tree[0].path,'images/a.png');
assert.equal(result.writes[2].body.force,false);
assert.match((await deletion({concurrent:true})).error.message,/non fast-forward/);
// La mise à jour de la carte doit identifier son ancien src avant de remplacer toutes les images.
const html=fs.readFileSync('documents.html','utf8');
const fn=html.slice(html.indexOf('function updateDomAfterRename'),html.indexOf('// ── Sous-titre'));
assert.ok(fn.indexOf("querySelectorAll('#shared-container .img-card')")<fn.indexOf("querySelectorAll('img')"));
for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
console.log('✓ Documents : références, copie isolée, concurrence, ressources du site, requêtes limitées et syntaxe.');
let imageWrites=[];
const imageSync={
 stableRead:async()=>({content:'data',commit:'opened'}), parse:()=>({QUESTIONS:[{id:'Q1',reponse:{ref:'a.png'}}]}),
 request:async(url,options={})=>{
  if(options.method){imageWrites.push(JSON.parse(options.body));return {sha:'created'};}
  if(url.includes('git/commits/'))return {tree:{sha:'base'}};
  return {tree:[{path:'images/a.png',sha:'original'}]};
 }
};
const imageApi=load(imageSync);
await assert.rejects(()=>imageApi.replaceShared('a.png','new','original',['Q2'],{}),/usages/);
assert.equal(imageWrites.length,0);
await assert.rejects(()=>imageApi.replaceShared('a.png','new','stale',['Q1'],{}),/changé/);
assert.equal(imageWrites.length,0);
await imageApi.replaceShared('a.png','new','original',['Q1'],{});
assert.equal(imageWrites.length,4);
assert.equal(imageWrites.at(-1).force,false);
assert.equal(imageWrites[1].tree[0].path,'images/a.png');
console.log('✓ Remplacement partagé : usages et version vérifiés, écriture conditionnelle.');
