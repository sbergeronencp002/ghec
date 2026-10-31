/* Gestion des images : références structurées et suppression liée à un commit précis. */
const GHECDocuments = (() => {
  const root = 'https://api.github.com/repos/sbergeronencp002/ghec/';
  function refs(q) {
    return [...(q.documents || []).flatMap(d => [d, ...(d.cols || [])]), q.reponse].filter(Boolean);
  }
  function users(questions, img) {
    return questions.filter(q => refs(q).some(r => r.ref === img)).map(q => q.id).sort();
  }
  function used(questions, img) { return users(questions, img).length > 0; }
  function renameRefs(questions, oldName, newName) {
    let changed = false;
    questions.forEach(q => refs(q).forEach(r => {
      if (r.ref === oldName) { r.ref = newName; changed = true; }
    }));
    return changed;
  }
  async function pool(items, limit, fn) {
    let cursor = 0;
    await Promise.all(Array.from({length:Math.min(limit, items.length)}, async () => {
      while (cursor < items.length) { const item = items[cursor++]; await fn(item); }
    }));
  }
  async function imageInfo(img, headers) {
    const commit = await GHECSync.head(headers);
    return GHECSync.request(root+'contents/images/'+encodeURIComponent(img)+'?ref='+commit, {headers});
  }
  async function replaceShared(img, content, expectedSha, expectedIds, headers) {
    const snapshot = await GHECSync.stableRead(headers);
    const state = GHECSync.parse(snapshot.content);
    if (JSON.stringify(users(state.QUESTIONS,img)) !== JSON.stringify(expectedIds)) throw new Error('Les usages ont changé. Rouvrez la fenêtre.');
    const parent = await GHECSync.request(root+'git/commits/'+snapshot.commit,{headers});
    const tree = await GHECSync.request(root+'git/trees/'+parent.tree.sha+'?recursive=1',{headers});
    if (tree.truncated || tree.tree.find(f=>f.path==='images/'+img)?.sha !== expectedSha) throw new Error('L’image a changé. Rouvrez la fenêtre.');
    const writeHeaders={...headers,'Content-Type':'application/json'};
    const post=(path,body)=>GHECSync.request(root+path,{method:'POST',headers:writeHeaders,body:JSON.stringify(body)});
    const blob=await post('git/blobs',{content,encoding:'base64'});
    const nextTree=await post('git/trees',{base_tree:parent.tree.sha,tree:[{path:'images/'+img,mode:'100644',type:'blob',sha:blob.sha}]});
    const nextCommit=await post('git/commits',{message:'Remplacer '+img,tree:nextTree.sha,parents:[snapshot.commit]});
    await GHECSync.request(root+'git/refs/heads/main',{method:'PATCH',headers:writeHeaders,body:JSON.stringify({sha:nextCommit.sha,force:false})});
    return blob.sha;
  }
  async function deleteUnused(img, headers) {
    const snapshot = await GHECSync.stableRead(headers);
    const state = GHECSync.parse(snapshot.content);
    if (used(state.QUESTIONS, img)) throw new Error('Image utilisée par '+users(state.QUESTIONS,img).join(', '));
    const commit = snapshot.commit;
    const parent = await GHECSync.request(root+'git/commits/'+commit, {headers});
    const tree = await GHECSync.request(root+'git/trees/'+parent.tree.sha+'?recursive=1', {headers});
    if (tree.truncated) throw new Error('Inventaire incomplet : suppression refusée.');
    if (!tree.tree.some(f => f.path === 'images/'+img)) throw new Error('Fichier déjà absent. Actualisez l’inventaire.');
    // Les ressources du site peuvent être utilisées hors des questions (logo, CSS, etc.).
    // Une lecture incomplète refuse la suppression plutôt que de supposer le fichier libre.
    const sources = tree.tree.filter(f => f.type === 'blob' && !f.path.startsWith('backups/') &&
      !f.path.startsWith('tools/') && !f.path.startsWith('images/') &&
      !['questions.js','questions-index.js'].includes(f.path) && /\.(js|html|css|json|webmanifest)$/.test(f.path));
    await pool(sources, 4, async file => {
      const source = await GHECSync.readFile(file.path, headers, commit);
      if (source.content.includes(img)) throw new Error('Image référencée dans '+file.path+' : suppression refusée.');
    });
    const writeHeaders = {...headers,'Content-Type':'application/json'};
    const post = (path, body) => GHECSync.request(root+path, {method:'POST',headers:writeHeaders,body:JSON.stringify(body)});
    // Ne contient que l’image : les données restent exclusivement écrites via Contents.
    const nextTree = await post('git/trees', {base_tree:parent.tree.sha,tree:[{path:'images/'+img,mode:'100644',type:'blob',sha:null}]});
    const nextCommit = await post('git/commits', {message:'Supprimer image non utilisée '+img,tree:nextTree.sha,parents:[commit]});
    // Un déplacement concurrent de main rend ce commit non fast-forward : GitHub refuse.
    await GHECSync.request(root+'git/refs/heads/main', {
      method:'PATCH',headers:writeHeaders,body:JSON.stringify({sha:nextCommit.sha,force:false})
    });
  }
  return {refs, users, used, renameRefs, pool, imageInfo, replaceShared, deleteUnused};
})();
