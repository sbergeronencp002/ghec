// Synchronisation commune des pages GHEC. Aucun secret n’est conservé ici.
const GHECSync = (() => {
  const ROOT = 'https://api.github.com/repos/sbergeronencp002/ghec/';
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  async function request(url, options = {}, format = 'json', timeoutMs = 12000) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async()=>{
          const r=await fetch(url,{...options,cache:'no-store',signal:controller.signal});
          if(!r.ok) {const error=new Error('GitHub : erreur '+r.status);error.status=r.status;throw error;}
          return format==='text'?r.text():format==='blob'?r.blob():r.json();
        })(),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Le chargement a dépassé le délai prévu. Réessaie.'));},timeoutMs);})
      ]);
    } finally { clearTimeout(timer); }
  }

  const head = async headers => (await request(ROOT+'git/ref/heads/main?t='+Date.now(), {headers})).object.sha;
  async function readFile(path, headers, ref) {
    const commit = ref || await head(headers);
    const d = await request(ROOT+'contents/'+path+'?ref='+commit, {headers});
    let content;
    if(d.content) content = new TextDecoder().decode(Uint8Array.from(atob(d.content.replace(/\n/g,'')),c=>c.charCodeAt(0)));
    else if(d.download_url) content = await request(d.download_url, {}, 'text');
    else throw new Error('Contenu GitHub absent : '+path);
    return {content,sha:d.sha,commit};
  }
  async function stableRead(headers, {maxWait=45000, poll=1000} = {}) {
    const start=Date.now();
    while(Date.now()-start < maxWait) {
      const snapshot=await readFile('questions.js',headers);
      if(await head(headers) === snapshot.commit) return snapshot;
      await new Promise(resolve=>setTimeout(resolve,poll));
    }
    throw new Error('Les données changent encore. Aucune écriture effectuée. Réessaie dans un instant.');
  }
  // Fusion à trois versions : les champs distincts se combinent; le même champ divergeant bloque.
  function merge(base, local, remote, path='données') {
    if(equal(base,local)) return clone(remote);
    if(equal(base,remote) || equal(local,remote)) return clone(local);
    if(base && local && remote && !Array.isArray(base) && !Array.isArray(local) && !Array.isArray(remote)
      && typeof base==='object' && typeof local==='object' && typeof remote==='object') {
      const out={};
      for(const k of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])) {
        const v=merge(base[k],local[k],remote[k],path+'.'+k);
        if(v!==undefined) out[k]=v;
      }
      return out;
    }
    throw new Error('Conflit sur '+path+' : une autre modification ou suppression a été publiée. Recharge avant de réessayer.');
  }
  function mergeState(base, local, remote) {
    const map = qs => Object.fromEntries(qs.map(q=>[q.id,q]));
    const merged=merge({QUESTIONS:map(base.QUESTIONS),REGLETTES:base.REGLETTES,IMAGE_DB:base.IMAGE_DB},
      {QUESTIONS:map(local.QUESTIONS),REGLETTES:local.REGLETTES,IMAGE_DB:local.IMAGE_DB},
      {QUESTIONS:map(remote.QUESTIONS),REGLETTES:remote.REGLETTES,IMAGE_DB:remote.IMAGE_DB});
    merged.QUESTIONS=Object.values(merged.QUESTIONS);
    return merged;
  }
  const parse = content => new Function(content+'\nreturn {QUESTIONS,REGLETTES,IMAGE_DB};')();
  async function edit({base, mutate, headers, message}) {
    const local=clone(base);
    if(mutate(local) === false) return null;
    for(let attempt=0;attempt<3;attempt++) {
      const snapshot=await stableRead(headers);
      const merged=mergeState(base,local,parse(snapshot.content));
      try {
        const result=await request(ROOT+'contents/questions.js',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},
          body:JSON.stringify({message,content:encode(generateQuestionsJs(merged.QUESTIONS,merged.REGLETTES,merged.IMAGE_DB)),sha:snapshot.sha,branch:'main'})});
        return {state:merged,sha:result.content.sha};
      } catch(e) { if(e.status!==409 || attempt===2)throw e; }
    }
  }
  const encode = text => {let binary='';for(const b of new TextEncoder().encode(text))binary+=String.fromCharCode(b);return btoa(binary);};
  let indexQueue=Promise.resolve();
  async function publishIndex(headers,message) {
    const run=async()=>{
      for(let attempt=0;attempt<3;attempt++) {
        const snapshot=await stableRead(headers);
        const questions=parse(snapshot.content).QUESTIONS;
        const index=await readFile('questions-index.js',headers,snapshot.commit);
        const content=generateIndexJs(questions);
        if(content===index.content)return;
        if(await head(headers)!==snapshot.commit)continue;
        try {
          await request(ROOT+'contents/questions-index.js',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},
            body:JSON.stringify({message:message+' [index]',content:encode(content),sha:index.sha,branch:'main'})});
          const latest=await stableRead(headers);
          if(latest.sha===snapshot.sha)return;
        } catch(e) { if(e.status!==409)throw e; }
      }
      throw new Error('Index non synchronisé : réessaie après actualisation.');
    };
    const pending=indexQueue.then(run,run);indexQueue=pending.catch(()=>{});return pending;
  }
  async function finishIndex(headers,message) {
    const id='ghec-index-sync-warning';
    try { await publishIndex(headers,message);document.getElementById(id)?.remove(); }
    catch(e) {
      console.error(e);
      let banner=document.getElementById(id);
      if(!banner) {
        banner=document.createElement('div');banner.id=id;banner.setAttribute('role','alert');
        banner.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;padding:16px;background:#fff3cd;color:#513d00;border:1px solid #d5b759;z-index:10000';
        const text=document.createElement('span');text.textContent='La modification est enregistrée, mais la liste principale n’est pas encore synchronisée. ';
        const button=document.createElement('button');button.textContent='Réessayer la synchronisation';
        button.onclick=async()=>{button.disabled=true;await finishIndex(headers,message);button.disabled=false;};
        banner.append(text,button);document.body.appendChild(banner);
      }
    }
  }

  return {request,readFile,stableRead,merge,mergeState,clone,parse,edit,publishIndex,finishIndex};
})();
