// Brouillons de Révision et modèles de tableaux, sans données d’authentification.
const GHECRevision = (() => {
  const KEY='ghec_revision_drafts_v1';let api,timer;
  const clone=x=>JSON.parse(JSON.stringify(x));
  function matrix(guide) {
    if(guide?.type==='grille')return {headers:clone(guide.entetes||[]),rows:clone(guide.rangees||[])};
    if(guide?.type==='tableau')return {headers:['Élément','Réponse'],rows:(guide.lignes||[]).map(row=>[row.label??'',row.valeur??''])};
    return null;
  }
  function fromMatrix(original,headers,rows) {
    const keep=(before,after)=>String(before??'')===String(after??'')?before:after;
    if(original?.type==='tableau')return {...clone(original),lignes:rows.map((row,i)=>({...original.lignes?.[i],label:keep(original.lignes?.[i]?.label,row[0]),valeur:keep(original.lignes?.[i]?.valeur,row[1])}))};
    const normalized=rows.map((row,r)=>{
      const before=original?.rangees?.[r]||[];
      const values=row.map((value,c)=>keep(before[c],value));
      while(values.length>before.length && !String(values.at(-1)??''))values.pop();
      return values;
    });
    const labels=headers.map((value,c)=>keep(original?.entetes?.[c],value));
    while(labels.length>(original?.entetes?.length||0) && !String(labels.at(-1)??''))labels.pop();
    return {...clone(original||{}),type:'grille',entetes:labels,rangees:normalized};
  }

  function read(){try{const data=JSON.parse(localStorage.getItem(KEY)||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch(_){return {};}}
  const draftKey=(id,key)=>id+'|'+key;
  function save() {
    const draft=api?.capture();if(!draft)return;
    try {const all=read();all[draftKey(draft.id,draft.key)]={...draft,savedAt:new Date().toISOString()};localStorage.setItem(KEY,JSON.stringify(all));render();const status=document.getElementById('rv-draft-status');if(status)status.textContent='Brouillon sauvegardé à '+new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});}
    catch(_){const status=document.getElementById('rv-draft-status');if(status)status.textContent='Brouillon non sauvegardé : espace local indisponible.';}
  }
  function saved(id,key) {clearTimeout(timer);try{const all=read();delete all[draftKey(id,key)];localStorage.setItem(KEY,JSON.stringify(all));}catch(_){}render();}
  function render() {
    const select=document.getElementById('rv-draft-select');if(!select)return;
    const value=select.value;select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='Choisir un brouillon';select.appendChild(empty);
    for(const [key,draft] of Object.entries(read()).sort((a,b)=>b[1].savedAt.localeCompare(a[1].savedAt))) {
      const option=document.createElement('option');option.value=key;option.textContent=draft.id+' — '+(draft.key==='guide'?'Guide':draft.key==='enonce'?'Énoncé':'Document')+' — '+new Date(draft.savedAt).toLocaleString('fr-CA');select.appendChild(option);
    }
    select.value=value;
  }
  function restore() {
    const draft=read()[document.getElementById('rv-draft-select').value];if(!draft)return;
    if(!api.canRestore())return;
    save();try{api.restore(draft);document.getElementById('rv-draft-status').textContent='Brouillon restauré. Vérifie puis enregistre.';}catch(e){alert('Restauration impossible : '+e.message+'. Le brouillon est conservé.');}
  }
  function discard() {
    const key=document.getElementById('rv-draft-select').value;if(!key||!confirm('Supprimer ce brouillon local ?'))return;
    try{const all=read();delete all[key];localStorage.setItem(KEY,JSON.stringify(all));render();}catch(_){alert('Suppression du brouillon impossible.');}
  }
  function init(adapter) {
    api=adapter;render();
    document.getElementById('rv-card')?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(save,400);});
    window.addEventListener('beforeunload',event=>{save();if(api.dirty()){event.preventDefault();event.returnValue='';}});
    window.addEventListener('pagehide',save);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save();});
  }
  return {matrix,fromMatrix,init,save,saved,restore,discard};
})();
