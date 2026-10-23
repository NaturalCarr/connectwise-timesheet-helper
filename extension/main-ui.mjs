const $=id=>document.getElementById(id);
if(new URLSearchParams(location.search).has('workspace'))document.body.classList.add('full-workspace');
$('open-workspace').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('popup.html?workspace=1'),active:true});
const button=$('toggle-ticket-json'),panel=$('ticket-json-panel');
button.onclick=()=>{const open=panel.hidden;panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){panel.scrollIntoView({block:'nearest',behavior:'instant'});$('ticket-json').focus({preventScroll:true});}};
for(const id of ['ticket-section','weekly-section']){
 const section=$(id);let ready=false;
 chrome.storage.local.get('helperUi:'+id).then(values=>{if(typeof values['helperUi:'+id]==='boolean')section.open=values['helperUi:'+id];ready=true;}).catch(()=>{ready=true;});
 section.addEventListener('toggle',()=>{if(ready)chrome.storage.local.set({['helperUi:'+id]:section.open}).catch(()=>{});});
}
