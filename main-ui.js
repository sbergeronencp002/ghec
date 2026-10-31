// Préférences et interactions de la page principale.
const GHECMain = (() => {
  const key='ghec_cahier_options';
  const ids=['exam-nom','exam-eleve','exam-groupe','exam-date','exam-score','exam-commentaires','exam-sources-images','exam-titres-documents'];
  try {
    const saved=JSON.parse(localStorage.getItem(key)||'{}');
    ids.forEach(id=>{const el=document.getElementById(id);if(el && Object.hasOwn(saved,id)) {
      if(el.type==='checkbox' && typeof saved[id]==='boolean')el.checked=saved[id];
      else if(el.type!=='checkbox' && typeof saved[id]==='string')el.value=saved[id];
    }});
  } catch(_) {}
  ids.forEach(id=>{const el=document.getElementById(id);el?.addEventListener('input',()=>{
    try {const values={};ids.forEach(k=>{const input=document.getElementById(k);if(input)values[k]=input.type==='checkbox'?input.checked:input.value;});localStorage.setItem(key,JSON.stringify(values));}catch(_){}
  });});
  function missingImages(names) {
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='missing-images-dialog';
      const title=document.createElement('h2');title.textContent='Certaines images ne sont pas disponibles';
      const text=document.createElement('p');text.textContent='Images manquantes : '+names.join(', ')+'. Tu peux réessayer, générer le document sans ces images ou annuler.';
      dialog.append(title,text);
      for(const [value,label] of [['retry','Réessayer'],['continue','Générer quand même'],['cancel','Annuler']]) {
        const button=document.createElement('button');button.type='button';button.textContent=label;
        button.onclick=()=>dialog.close(value);dialog.appendChild(button);
      }
      dialog.addEventListener('close',()=>{const value=dialog.returnValue||'cancel';dialog.remove();resolve(value);},{once:true});
      dialog.addEventListener('cancel',()=>{dialog.returnValue='cancel';});
      document.body.appendChild(dialog);dialog.showModal();
    });
  }
  // Une seule fenêtre active au clavier, avec retour au contrôle qui l’a ouverte.
  const windows=[['q-modal-overlay','closeQModal'],['preview-modal','closePreviewBtn'],['continuum-modal','closeContinuumBtn'],
    ['cahier-panel','closeCahier'],['lightbox','closeLightbox'],['text-zoom-overlay','closeTextZoomBtn'],['exam-overlay','closeExam']];
  const stack=[];
  let opener=null;
  document.addEventListener('pointerdown',e=>{opener=e.target.closest('button,a,[tabindex]')||document.activeElement;},true);
  const focusables=node=>[...node.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')]
    .filter(el=>el.getClientRects().length && !el.closest('[hidden]'));
  const active=()=>stack.at(-1)?.node;
  const focusFirst=node=>(focusables(node)[0]||node).focus();
  function reconcile() {
    for(const [id,close] of windows) {
      const node=document.getElementById(id);if(!node)continue;
      const visible=id==='exam-overlay'?node.style.display!=='none':node.classList.contains('open');
      const idx=stack.findIndex(x=>x.node===node);
      if(visible && idx<0) {
        const previous=document.activeElement;
        stack.push({node,close,previous:opener?.isConnected?opener:previous});opener=null;
        node.setAttribute('tabindex','-1');node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');focusFirst(node);
      } else if(!visible && idx>=0) {
        const wasTop=idx===stack.length-1;const [closed]=stack.splice(idx,1);
        if(wasTop) {
          if(active())focusFirst(active());
          else if(closed.previous?.isConnected)closed.previous.focus();
        }
      }
    }
  }
  const observer=new MutationObserver(reconcile);
  windows.forEach(([id])=>{const node=document.getElementById(id);if(node)observer.observe(node,{attributes:true,attributeFilter:['class','style']});});
  document.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]')) {if(e.key==='Escape')e.stopImmediatePropagation();return;}
    const node=active();if(!node)return;
    if(e.key==='Escape') {
      e.preventDefault();e.stopImmediatePropagation();
      const close=stack.at(-1).close;if(typeof globalThis[close]==='function')globalThis[close]();return;
    }
    if(e.key==='Tab') {
      const list=focusables(node),first=list[0],last=list.at(-1);
      if(!first) {e.preventDefault();node.focus();return;}
      if(!node.contains(document.activeElement) || (e.shiftKey && document.activeElement===first)) {e.preventDefault();(e.shiftKey?last:first).focus();}
      else if(!e.shiftKey && document.activeElement===last) {e.preventDefault();first.focus();}
    }
  },true);
  document.addEventListener('focusin',e=>{const node=active();if(node && !node.contains(e.target) && !document.querySelector('dialog[open]'))focusFirst(node);});
  return {missingImages};
})();
