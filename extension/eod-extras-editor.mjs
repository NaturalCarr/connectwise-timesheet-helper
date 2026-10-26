import { formatInventoryCount, renderEodExtras } from './eod-extras.mjs';
export function mountExtras(report, host, changed) {
 host.replaceChildren();
 const heading = document.createElement('h3'); heading.textContent = 'Finish your Daily Report';
 const intro = document.createElement('p'); intro.textContent = 'Add stock counts and purchase recommendations below the ticket table. Saved locally for this date; no ConnectWise changes.';
 host.append(heading,intro);
 const refresh = () => { try { renderEodExtras(report); changed(); } catch(error) { changed(error); } };
 const section = (key,title,description,fields) => {
  report[key] ||= [];
  const card=document.createElement('section');card.className='extras-card';
  const h=document.createElement('h4');h.textContent=title;const hint=document.createElement('p');hint.textContent=description;
  const list=document.createElement('div');const add=document.createElement('button');add.type='button';add.textContent='+ Add '+(key==='inventory'?'inventory item':'purchase');
  const draw=()=>{list.replaceChildren();for(const [index,row] of report[key].entries()){
   const line=document.createElement('div');line.className='extras-row '+key;
   for(const [name,label,placeholder] of fields){const field=document.createElement('label');field.textContent=label;const input=document.createElement('input');input.value=row[name] || '';input.placeholder=placeholder;input.setAttribute('aria-label',title+' '+label);if(name==='quantity'){input.type='number';input.min='1';input.step='1';}if(name==='url')input.type='url';input.onblur=()=>{if(name==='count'){row[name]=formatInventoryCount(input.value);input.value=row[name];refresh();}};input.oninput=()=>{row[name]=input.value;refresh();};field.append(input);line.append(field);}
   const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+title+' row '+(index+1));remove.onclick=()=>{report[key].splice(index,1);draw();refresh();};line.append(remove);list.append(line);
  }};
  add.onclick=()=>{report[key].push(key==='inventory'?{item:'',count:''}:{item:'',quantity:1,url:''});draw();list.lastElementChild.querySelector('input').focus();};draw();card.append(h,hint,list,add);host.append(card);
 };
 section('inventory','Inventory','Record quantities or a model breakdown, such as 4 M1, 5 M5.',[['item','Item','MacBook loaners'],['count','Count / details','4 M1, 5 M5']]);
 const cameras=document.createElement('section');cameras.className='extras-card';
 const camerasTitle=document.createElement('h4');camerasTitle.textContent='Document cameras';const camerasHint=document.createElement('p');camerasHint.textContent='Count working DocCams currently in use. List rooms needing a camera, separated by commas. Leave unknown values blank; enter 0 only when confirmed.';
 const cameraRow=document.createElement('div');cameraRow.className='doccam-row';
 const countLabel=document.createElement('label');countLabel.textContent='DocCams (In Use)';const count=document.createElement('input');count.type='number';count.min='0';count.step='1';count.value=report.docCams?.inUse ?? '';count.placeholder='Working cameras in use';count.setAttribute('aria-label','DocCams (In Use)');countLabel.append(count);
 const roomsLabel=document.createElement('label');roomsLabel.textContent='DocCam needed In';const rooms=document.createElement('input');rooms.value=report.docCams?.neededIn?.join(', ') || '';rooms.placeholder='e.g. 211, 336';rooms.setAttribute('aria-label','DocCam needed In');roomsLabel.append(rooms);
 const clear=document.createElement('button');clear.type='button';clear.textContent='Clear';clear.setAttribute('aria-label','Clear document camera details');
 const updateCameras=()=>{const value={};if(count.value!=='')value.inUse=Number(count.value);if(rooms.value.trim())value.neededIn=rooms.value.split(',').map(r=>r.trim()).filter(Boolean);report.docCams=Object.keys(value).length?value:null;refresh();};
 count.oninput=updateCameras;rooms.oninput=updateCameras;clear.onclick=()=>{count.value='';rooms.value='';report.docCams=null;refresh();};cameraRow.append(countLabel,roomsLabel,clear);cameras.append(camerasTitle,camerasHint,cameraRow);host.append(cameras);
 section('purchases','Recommended purchase links','The complete Item name × quantity label becomes the link in your email.',[['item','Item name','USB-C adapter'],['quantity','Quantity','1'],['url','Purchase link','https://…']]);
}
