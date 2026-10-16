export function mascotState(state,lastProgress,now=Date.now(),stallMs=90000){
 if(state==='working' && now-lastProgress>=stallMs)return {state:'stopped',label:'Stopped',stalled:true};
 return {state,label:{working:'Working...',stopped:'Stopped',completed:'Completed',ready:'Ready'}[state]||'Stopped',stalled:false};
}
export function createRunMascot(root,{stallMs=90000}={}){
 let state='ready',lastProgress=Date.now(),frames=[],frame=0;
 const label=root.querySelector('[data-mascot-label]'),note=root.querySelector('[data-mascot-note]');
 const paint=()=>{const current=mascotState(state,lastProgress,Date.now(),stallMs);root.dataset.state=current.state;root.dataset.stalled=String(current.stalled);label.textContent=current.label;note.textContent=current.stalled?'No progress update for 90 seconds. The current request may still finish; no automatic retry was sent.':'';};
 const set=next=>{state=next;lastProgress=Date.now();paint();};
 fetch(new URL('./assets/carlton.svg',import.meta.url)).then(response=>{if(!response.ok)throw Error('Asset unavailable');return response.text();}).then(text=>{
   const doc=new DOMParser().parseFromString(text,'image/svg+xml');
   const svg=document.importNode(doc.documentElement,true);root.querySelector('[data-mascot-dancer]').append(svg);frames=[...svg.querySelectorAll('.carlton-frame')];
 }).catch(()=>{note.textContent='Animation unavailable. Run status remains above.';});
 const dance=setInterval(()=>{if(frames.length && !matchMedia('(prefers-reduced-motion: reduce)').matches){frames[frame].style.display='none';frame=(frame+1)%frames.length;frames[frame].style.display='';}},118);
 const watch=setInterval(paint,1000);
 window.addEventListener('pagehide',()=>{clearInterval(dance);clearInterval(watch);},{once:true});
 paint();
 return {set,heartbeat(){if(state==='working'){lastProgress=Date.now();paint();}}};
}
