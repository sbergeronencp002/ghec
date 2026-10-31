// Brouillons et vérifications d’Admin. Aucun champ d’authentification n’est enregistré.
const GHECAdmin = (() => {
  const STORAGE='ghec_admin_drafts_v1';
  const fixed=['q-id','q-niveau','q-competence','q-oi','q-enonce','rep-type','reg-preset','guide-type'];
  let adapter,restoring=false,timer,lastKey='';
  const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function warnings(q,questions,imageDb) {
    const out=[];
    const guide=q.guide;
    const hasGuide=typeof guide==='string'?!!guide.trim():!!guide &&
      ((guide.rangees||[]).flat().some(v=>String(v??'').trim()) || (guide.lignes||[]).some(v=>String(v.valeur||'').trim()));
    if(!hasGuide)out.push('La réponse attendue est vide.');
    const docs=q.documents||[],labels=new Set(),refs=[];
    for(const d of docs)for(const col of (d.cols||[d])) {
      for(const m of String(col.titre||'').matchAll(/\bdocument\s+([A-Z]|\d+)\b/gi))labels.add(m[1].toUpperCase());
      if(col.ref)refs.push(col.ref);
      if(!col.ref && !String(col.texte||'').trim())out.push('Un document ne contient ni texte ni image.');
    }
    const cited=new Set();
    for(const m of String(q.enonce||'').matchAll(/\bdocuments?\s+([A-Z]|\d+)\b(?:\s*(?:à|a|et|-)\s*([A-Z]|\d+)\b)?/gi)) {
      cited.add(m[1].toUpperCase());
      if(m[2]) {
        const a=m[1].toUpperCase(),b=m[2].toUpperCase();cited.add(b);
        if(/^[A-Z]$/.test(a)&&/^[A-Z]$/.test(b)&&/\s(?:à|a)\s/i.test(m[0]))
          for(let c=a.charCodeAt(0);c<=b.charCodeAt(0);c++)cited.add(String.fromCharCode(c));
      }
    }
    const missing=[...cited].filter(x=>!labels.has(x));
    if(missing.length)out.push('Documents cités sans titre correspondant : '+missing.join(', ')+'.');
    if(!docs.length && /illustration|\bdocuments?\b/i.test(q.enonce||''))out.push('L’énoncé mentionne un support, mais aucun document n’est ajouté.');
    if(q.reponse?.ref)refs.push(q.reponse.ref);
    const absent=[...new Set(refs.filter(ref=>!imageDb[ref]))];
    if(absent.length)out.push('Images absentes du catalogue : '+absent.join(', ')+'.');
    const enonce=normal(q.enonce);
    const duplicates=questions.filter(other=>other.id!==q.id && enonce && normal(other.enonce)===enonce).map(other=>other.id);
    if(duplicates.length)out.push('Énoncé identique ou très proche après normalisation : '+duplicates.join(', ')+'.');
    return [...new Set(out)];
  }
  function read() {try {const value=JSON.parse(localStorage.getItem(STORAGE)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch(_){return {};}}
  function keyOf(snapshot) {return (snapshot.editingId?'edit:':'new:')+(snapshot.fields.find(x=>x.id==='q-id')?.value||'sans-id');}
  function save() {
    if(restoring || !adapter?.dirty())return;
    try {
      const snapshot=adapter.capture(),key=keyOf(snapshot),drafts=read();
      drafts[key]={...snapshot,savedAt:new Date().toISOString()};
      // Déplacer le brouillon si son nouvel identifiant a changé.
      if(lastKey && lastKey!==key && lastKey.startsWith('new:') && key.startsWith('new:'))delete drafts[lastKey];
      localStorage.setItem(STORAGE,JSON.stringify(drafts));lastKey=key;
      const status=document.getElementById('draft-status');if(status)status.textContent='Brouillon sauvegardé à '+new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});
      render();
    } catch(e) {const status=document.getElementById('draft-status');if(status)status.textContent='Brouillon non sauvegardé : espace local indisponible. Ta saisie est toujours dans le formulaire.';}
  }
  function mark() {if(restoring)return;adapter?.markDirty();clearTimeout(timer);timer=setTimeout(save,500);}
  function render() {
    const select=document.getElementById('draft-select');if(!select)return;
    const current=select.value;select.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choisir un brouillon';select.appendChild(placeholder);
    for(const [key,draft] of Object.entries(read()).sort((a,b)=>b[1].savedAt.localeCompare(a[1].savedAt))) {
      const option=document.createElement('option');option.value=key;
      option.textContent=(draft.editingId||draft.fields.find(x=>x.id==='q-id')?.value||'Nouvelle question')+' — '+new Date(draft.savedAt).toLocaleString('fr-CA');select.appendChild(option);
    }
    select.value=current;
  }
  function restoreSelected() {
    const key=document.getElementById('draft-select').value,draft=read()[key];if(!draft)return;
    if(adapter.dirty()&&!confirm('Sauvegarder la saisie actuelle en brouillon et restaurer celui sélectionné ?'))return;
    save();restoring=true;
    try {adapter.restore(draft);lastKey=key;adapter.markDirty();document.getElementById('draft-status').textContent='Brouillon restauré. Vérifie la question avant de publier.';}
    catch(e){alert('Restauration impossible : '+e.message+'. Le brouillon est conservé.');}
    finally {restoring=false;render();}
  }
  function discardSelected() {
    const key=document.getElementById('draft-select').value;if(!key)return;
    if(!confirm('Supprimer ce brouillon local ? La question publiée restera inchangée.'))return;
    const drafts=read();delete drafts[key];localStorage.setItem(STORAGE,JSON.stringify(drafts));render();
  }
  function published(id) {
    clearTimeout(timer);
    try {const drafts=read();delete drafts['new:'+id];delete drafts['edit:'+id];localStorage.setItem(STORAGE,JSON.stringify(drafts));}catch(_){}
    lastKey='';adapter?.clean();render();
    const status=document.getElementById('draft-status');if(status)status.textContent='Question enregistrée. Le brouillon correspondant a été retiré.';
  }
  function stage(label) {const el=document.getElementById('publish-status');if(el)el.textContent=label;}
  function init(api) {
    adapter=api;
    const bar=document.getElementById('admin-drafts');if(bar)bar.hidden=false;render();
    document.querySelector('.container')?.addEventListener('input',e=>{if(e.target.closest('#section-contexte,#section-question,#section-docs,#section-reponse,#section-reglette,#section-guide')||e.target.id==='q-id')mark();});
    document.querySelector('.container')?.addEventListener('change',e=>{if(e.target.closest('#section-contexte,#section-question,#section-docs,#section-reponse,#section-reglette,#section-guide')||e.target.id==='q-id')mark();});
    window.addEventListener('pagehide',save);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save();});
    window.addEventListener('beforeunload',save);
  }
  function quiet(fn) {const previous=restoring;restoring=true;try{return fn();}finally{restoring=previous;}}
  function navigated(){clearTimeout(timer);lastKey='';}
  return {fixed,warnings,init,save,mark,restoreSelected,discardSelected,published,stage,quiet,navigated};
})();
