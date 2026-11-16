// Visible Service Board search only. The resource pattern is user supplied.
function searchRakeBoard(resourcesFilter, ticketId = null) {
 const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
 const resources = [...document.querySelectorAll('#ResourceList-input')].filter(visible);
 if (resources.length !== 1) throw new Error('Expected one visible Resources filter on the Service Board.');
 const row = resources[0].closest('tr');
 if (!row) throw new Error('Resources filter row was not located.');
 const fields = [...row.querySelectorAll('input[id$="-input"]')].filter(visible);
 if (ticketId !== null && !fields.some(el => el.id === 'SR_Service_RecID-input')) throw new Error('Ticket number filter was not located.');
 const expected=field=>field===resources[0]?resourcesFilter:field.id==='SR_Service_RecID-input' && ticketId!==null?String(ticketId):'';
 const sameFilters=fields.every(field=>field.value===expected(field));
 for (const field of fields) {
  const value = field === resources[0] ? resourcesFilter : field.id === 'SR_Service_RecID-input' && ticketId !== null ? String(ticketId) : '';
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,value);
  field.dispatchEvent(new InputEvent('input',{bubbles:true,data:value,inputType:'insertText'}));
  field.dispatchEvent(new Event('change',{bubbles:true}));
  if (field.value !== value) throw new Error('The scoped Resources search did not retain its filters.');
 }
 const buttons = [...document.querySelectorAll('.cw-toolbar-search')].filter(visible);
 if (buttons.length !== 1) throw new Error('Expected one Service Board Search action.');
 const list=document.getElementById('srboard-listview-scroller');
 window.__cwRakeRead?.observer?.disconnect();
 const receipt={changed:sameFilters};
 const region=list?.parentElement;
 receipt.observer=new MutationObserver(records=>{if(!list?.isConnected || records.some(record=>region?.contains(record.target)))receipt.changed=true;});
 receipt.observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true});
 window.__cwRakeRead=receipt;
 buttons[0].click();
 return {searched:true};
}
function inspectRakeBoard(resourcesFilter, ticketId = null) {
 const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
 if(!window.__cwRakeRead?.changed)return {ready:false,reason:'Waiting for the changed search to refresh the list'};
 const clean = value => String(value || '').trim().replace(/~$/,'').trim();
 const closed = value => /^(pending\s+closure|completed|closed)(?:\b|\/)/i.test(clean(value));
 const resource = [...document.querySelectorAll('#ResourceList-input')].filter(visible)[0];
 if (!resource) {
  const summaries = [...document.querySelectorAll('input.cw_PsaSummaryHeader')].filter(visible);
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-/);
  const states = [...document.querySelectorAll('input.cw_status')].filter(el => visible(el) && /^Status\s*:/i.test(el.closest('tr')?.innerText.trim() || ''));
  if (header && summaries.length === 1 && states.length === 1 && (!ticketId || Number(header[1]) === ticketId)) return {ready:true,start:1,end:1,total:1,autoOpened:true,rows:[{ticketId:Number(header[1]),summary:summaries[0].value,status:states[0].value,closed:closed(states[0].value)}]};
  return {ready:false};
 }
 if (resource.value !== resourcesFilter) throw new Error('Resources filter changed during collection.');
 const fields = [...resource.closest('tr').querySelectorAll('input[id$="-input"]')].filter(visible);
 if (fields.some(el => el !== resource && el.value.trim() !== (el.id === 'SR_Service_RecID-input' && ticketId ? String(ticketId) : ''))) throw new Error('Other Service Board filters changed during collection.');
 const list = document.getElementById('srboard-listview-scroller');
 if (!visible(list)) return {ready:false,reason:'Ticket list is not visible'};
 const rows = [...list.querySelectorAll('tr')].map(tr => [...tr.children].filter(el=>el.tagName==='TD').map(el=>el.innerText.trim())).filter(cells=>cells.length>9 && /^\d+$/.test(cells[1]||''));
 const counter = document.body.innerText.match(/(?:View\s+)?(\d+)\s*[-–]\s*(\d+)\s+of\s+(\d+)/i);
 if (/No Records Found|No results found/i.test(list.innerText) && (!counter || Number(counter[3]) === 0)) return {ready:true,start:0,end:0,total:0,rows:[]};
 if (!counter) return {ready:false,reason:'Page counter not found'};
 const start=Number(counter[1]),end=Number(counter[2]),total=Number(counter[3]);
 if (!rows.length || rows.length !== end-start+1 || rows.some(cells=>ticketId && Number(cells[1])!==ticketId)) return {ready:false,reason:'Ticket rows do not match the page counter',rowCount:rows.length,start,end,total};
 return {ready:true,start,end,total,rows:rows.map(cells=>({ticketId:Number(cells[1]),summary:cells[6],status:cells[4],resources:cells[5],company:cells[8],closed:closed(cells[4])}))};
}
function advanceRakeBoard(expectedEnd) {
 const visible=el=>el && el.getBoundingClientRect().width>0 && el.getBoundingClientRect().height>0;
 const counters=[...document.querySelectorAll('.cw-ml-pgopt-count')].filter(visible);
 if(counters.length!==1)throw new Error('Expected one visible Service Board page counter.');
 const counter=counters[0],range=counter.innerText.match(/(\d+)\s*[-–]\s*(\d+)\s+of\s+(\d+)/);
 if(!range || Number(range[2])!==expectedEnd || Number(range[2])>=Number(range[3]))throw new Error('The board page counter changed before Next.');
 const next=[...counter.parentElement.querySelectorAll('.nextButton .mm_button')].filter(visible);
 if(next.length!==1 || next[0].getAttribute('tabindex')==='-1' || next[0].closest('.nextButton').getAttribute('aria-disabled')==='true')throw new Error('Next page was not uniquely located. Increase Rows Per Page to include the full list, then rescan.');
 window.__cwRakeRead?.observer?.disconnect();
 const region=document.getElementById('srboard-listview-scroller')?.parentElement;
 const receipt={changed:false};
 receipt.observer=new MutationObserver(records=>{if(!region?.isConnected || records.some(record=>region.contains(record.target)))receipt.changed=true;});
 receipt.observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true});
 window.__cwRakeRead=receipt;
 next[0].click();
 return {clicked:true};
}
async function readRakeBoardInTab({tabId,resourcesFilter,ticketId=null}) {
 if(typeof resourcesFilter!=='string'||!resourcesFilter.trim()||resourcesFilter.length>100)throw new Error('Enter the CW Resources search pattern.');
 if(ticketId!==null && (!Number.isSafeInteger(ticketId)||ticketId<=0))throw new Error('Invalid eligibility ticket ID.');
 await connectwiseTab(tabId);
 await chrome.tabs.update(tabId,{active:true});
 const board=await ensureServiceBoard(tabId);
 const target={tabId,frameIds:[board.frameId]};
 await executeConnectWiseScript({target,func:searchRakeBoard,args:[resourcesFilter,ticketId]});
 const rows=[],ids=new Set();let previousEnd=-1,total=null;
 for(let page=0;page<1000;page++){
  let state,lastKey='',stable=0;
  for(let attempt=0;attempt<120;attempt++){
   const [read]=await executeConnectWiseScript({target,func:inspectRakeBoard,args:[resourcesFilter,ticketId]});state=read.result;
   const key=state?.ready && state.start>previousEnd?JSON.stringify(state):'';
   stable=key && key===lastKey?stable+1:0;lastKey=key;
   if(stable>=3)break;
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(stable<3)throw new Error('The assigned-ticket list did not finish loading: '+JSON.stringify(state)+'. No partial backlog was accepted.');
  if(total!==null && total!==state.total)throw new Error('CW list count changed during collection. Rescan before applying.');
  total=state.total;
  for(const row of state.rows){if(ids.has(row.ticketId))throw new Error('A CW ticket appeared on multiple pages. Rescan before applying.');ids.add(row.ticketId);rows.push(row);}
  if(state.end>=state.total)return {ok:true,resourcesFilter,total,rows:rows.filter(row=>!row.closed),excludedClosed:rows.filter(row=>row.closed).length};
  previousEnd=state.end;
  await executeConnectWiseScript({target,func:advanceRakeBoard,args:[state.end]});
 }
 throw new Error('Too many CW list pages. No partial backlog was accepted.');
}
async function checkRakeEligibilityInTab(message) {
 const found=await readRakeBoardInTab(message);
 if(found.rows.length>1)throw new Error('Assignment lookup returned multiple CW tickets for one ID.');
 return {ok:true,eligible:found.rows.length===1,reason:found.rows.length?'Open and assigned in Resources':'Ticket is no longer open and assigned in this Resources search'};
}
