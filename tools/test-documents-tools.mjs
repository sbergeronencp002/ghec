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
 request:async(url,options={})=>{
  if(options.method==='PUT') {
   imageWrites.push({url,headers:options.headers,body:JSON.parse(options.body)});
   return {content:{sha:'new-blob-sha'}};
  }
  throw Error('Requête inattendue : '+url);
 }
};
const imageApi=load(imageSync);
await assert.rejects(()=>imageApi.replaceShared('a.png','new',null,['Q1'],{}),/Version/);
assert.equal(imageWrites.length,0);
const newSha=await imageApi.replaceShared('a.png','new','original',['Q1'],{});
assert.equal(newSha,'new-blob-sha');
assert.equal(imageWrites.length,1);
assert.ok(imageWrites[0].url.endsWith('/contents/images/a.png'));
assert.equal(imageWrites[0].body.sha,'original');
assert.equal(imageWrites[0].body.content,'new');
assert.equal(imageWrites[0].body.branch,'main');
assert.equal(imageWrites[0].headers['Content-Type'],'application/json');
console.log('✓ Remplacement partagé : écriture unique conditionnée au SHA, sans reconstruction de commit.');

// Vérifie le contrat réel entre le module partagé et Documents, sans mock de son export.
const integration=vm.createContext({});
vm.runInContext(fs.readFileSync('sync-data.js','utf8')+';globalThis.sync=GHECSync',integration);
for(const name of ['head','readFile','request','stableRead'])assert.equal(typeof integration.sync[name],'function',name+' doit être accessible');
console.log('✓ Contrat réel Documents/synchronisation : head accessible.');
