import { configuredDefaults } from './config-settings.mjs';
import { mainWorkspaceTab } from './navigation.mjs';
import { eodStatuses } from './eod-model.mjs';
import { collectOpenRakeReferences, validateRakeInput, previewRake, applyRake, iiqReferences, rakeDirection } from './rake-model.mjs';
const $ = id => document.getElementById(id);
let preview = null, busy = false, stop = false, continuing = false;
let currentAction=null;
const journalKey = 'iiqRake:last';
const configurationKey = 'iiqRake:settings';
function origin() {
 const url = new URL($('origin').value.trim());
 if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.incidentiq\.com$/i.test(url.hostname) || url.username || url.password || !['','/'].includes(url.pathname) || url.search || url.hash) throw new Error('Enter an HTTPS Incident IQ site URL, without a page path.');
 return url.origin;
}
let lastInput=null, detailTabId=null;
async function input(browser = null) {
 const resourcesFilter=$('resources-filter').value.trim();
 if(!resourcesFilter)throw new Error('Enter your CW Resources filter, for example *your-login*.');
 if ($('scope').value === 'json') return validateRakeInput({...JSON.parse($('input-json').value),resourcesFilter});
 if(!browser){if(lastInput)return lastInput;throw new Error('Scan the CW backlog first, then export its reference list.');}
 $('status').textContent='Collecting open CW tickets assigned through Resources '+resourcesFilter+'…';
 const backlog=await browser.listOpenTickets(resourcesFilter);
 const limit=$('scope').value==='cw-recent'?Number($('limit').value):null;
 if(limit!==null && (!Number.isSafeInteger(limit)||limit<1))throw new Error('Newest ticket count must be a positive integer.');
 const collected=collectOpenRakeReferences(backlog.rows,limit);
 $('source-summary').textContent=collected.totalOpen+' open assigned CW tickets found; '+collected.selectedOpen+' in scope; '+collected.skipped.length+' without one IIQ reference. '+backlog.excludedClosed+' pending closure/completed/closed rows excluded.';
 $('unlinked').hidden=!collected.skipped.length;$('unlinked-rows').replaceChildren();
 for(const row of collected.skipped){const li=document.createElement('li');li.textContent='CW #'+row.ticketId+' — '+row.summary+' — '+row.reason;$('unlinked-rows').append(li);}
 lastInput=validateRakeInput({schemaVersion:'1.0',direction:rakeDirection,resourcesFilter,tickets:collected.tickets});
 return lastInput;
}
function log(value) { $('result').textContent = JSON.stringify(value, null, 2); }
function busyState(value) {
 busy = value;
 document.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = ['copy','copy-top'].includes(el.id)?false:value; });
 $('stop').disabled = !value;
 if (!value) { $('apply').disabled = !preview?.rows.some(row => row.selected && ['change','review'].includes(row.state)); scopeChanged(); }
}
function scopeChanged() { $('limit-label').hidden = $('scope').value !== 'cw-recent'; }
function render() {
 $('rows').replaceChildren();
 const counts = {};
 for (const row of preview?.rows || []) {
  counts[row.state] = (counts[row.state] || 0) + 1;
  const card = document.createElement('article'); card.className = 'rake-row ' + row.state;
  const heading = document.createElement('div'); heading.className = 'row-heading';
  const check = document.createElement('input'); check.type = 'checkbox'; check.checked = Boolean(row.selected); check.disabled = busy || !['change','review'].includes(row.state) || !row.targetStatus;
  check.setAttribute('aria-label', `Update ${row.reference} in CW`);
  check.onchange = () => { row.selected = check.checked; persistResults().catch(error=>{$('status').textContent=error.message;}); $('apply').disabled = !preview.rows.some(row => row.selected); };
  const title = document.createElement('strong'); title.textContent = row.reference + (row.ticketId ? ' · CW #' + row.ticketId : '');
  const state = document.createElement('span'); state.textContent = row.state.replaceAll('_',' ');
  heading.append(check, title, state); card.append(heading);
  const detail = document.createElement('p'); detail.className = 'row-detail'; detail.textContent = row.summary || 'Matching ticket'; card.append(detail);
  const states = document.createElement('div'); states.className = 'states';
  for (const [label, value] of [['Incident IQ', row.iiqStatus], ['ConnectWise now', row.cwStatus]]) { const field = document.createElement('label'); const name = document.createElement('span'); name.textContent = label; const text = document.createElement('output'); text.textContent = value || 'Not read'; field.append(name, text); states.append(field); }
  const target = document.createElement('label'); const name = document.createElement('span'); name.textContent = 'Set CW status to'; const select = document.createElement('select'); select.add(new Option('Choose status…',''));
  for (const status of eodStatuses) select.add(new Option(status,status));
  select.value = row.targetStatus || ''; select.disabled = busy || !['change','review','unchanged'].includes(row.state);
  select.onchange = () => { row.targetStatus = select.value || null; row.reason = 'Manually reviewed CW mapping'; row.state = row.targetStatus ? (row.targetStatus === row.cwStatus.replace(/~$/,'').trim() ? 'unchanged' : 'change') : 'review'; row.selected = row.state === 'change'; render(); persistResults().catch(error=>{$('status').textContent=error.message;}); };
  target.append(name,select); states.append(target); card.append(states);
  const reason = document.createElement('p'); reason.className = 'row-detail'; reason.textContent = row.error || row.reason || ''; card.append(reason); $('rows').append(card);
 }
 $('summary').textContent = Object.entries(counts).map(([key,count]) => `${count} ${key}`).join(' · ') || 'No handled IIQ references found in this scope.';
 $('apply').textContent=continuing?'Continue selected changes to CW':'Apply selected changes to CW';
 $('apply').disabled = busy || !preview?.rows.some(row => row.selected && ['change','review'].includes(row.state));
}
async function persistResults(result = null) {
 await chrome.storage.local.set({ [journalKey]: { preview, result, updatedAt: new Date().toISOString() } });
}
async function refreshTabs() {
 const selectedIiq = $('iiq-tab').value, selectedCw = $('cw-tab').value;
 const site = origin();
 const allowed = await chrome.permissions.contains({ origins: [site + '/*'] });
 const cw = await chrome.tabs.query({ url: 'https://na.myconnectwise.net/*' });
 const iiq = allowed ? await chrome.tabs.query({ url: site + '/*' }) : [];
 const saved = await chrome.storage.local.get('connectwiseTabId');
 for (const [id,tabs,selected] of [['iiq-tab',iiq,selectedIiq],['cw-tab',cw,selectedCw || String(saved.connectwiseTabId || '')]]) {
  const select = $(id); select.replaceChildren(new Option('Choose a tab…',''));
  for (const tab of tabs) select.add(new Option(tab.title || tab.url, String(tab.id)));
  if (tabs.some(tab => String(tab.id) === selected)) select.value = selected;
  else if (tabs.length === 1) select.value = String(tabs[0].id);
 }
 $('permission-status').textContent = allowed ? 'IIQ site connected. Choose the IIQ tab to read.' : 'Connect IIQ site to grant read access to its displayed pages.';
}
async function send(action, tabId, fields = {}) {
 currentAction={action,tabId,ticketId:fields.ticketId||null,reference:fields.reference||null,startedAt:new Date().toISOString()};
 const result = await chrome.runtime.sendMessage({ action, tabId, ...fields });
 currentAction=null;
 if (!result?.ok) throw new Error(result?.error || action + ' failed. Reload the updated helper if necessary.');
 return result;
}
async function driver() {
 const iiqTabId = Number($('iiq-tab').value), selectedCw = Number($('cw-tab').value);
 if (!iiqTabId || !selectedCw) throw new Error('Choose one IIQ tab and one ConnectWise tab.');
 const sourceTab=await chrome.tabs.get(iiqTabId),cwTab=await chrome.tabs.get(selectedCw);
 if(new URL(sourceTab.url).origin!==origin())throw new Error('Choose an IIQ tab from the configured IIQ site. Your preview is preserved.');
 if(!cwTab.url?.startsWith('https://na.myconnectwise.net/'))throw new Error('Choose a live ConnectWise tab. Your preview is preserved.');
 const settings = await configuredDefaults(await (await fetch(chrome.runtime.getURL('ticket-settings.json'))).json());
 const cwTabId = await mainWorkspaceTab(selectedCw, text => { $('status').textContent = text; });
 const getDetailTab=async()=>{
  if(detailTabId){try{const tab=await chrome.tabs.get(detailTabId);if(tab.url?.startsWith('https://na.myconnectwise.net/'))return detailTabId;}catch{}}
  const base=new URL((await chrome.tabs.get(cwTabId)).url);base.search='?locale=en_US';base.hash='';
  const tab=await chrome.tabs.create({url:base.href,active:true});detailTabId=tab.id;
  for(let n=0;n<80;n++){const current=await chrome.tabs.get(detailTabId);if(current.url?.startsWith('https://na.myconnectwise.net/'))return detailTabId;await new Promise(resolve=>setTimeout(resolve,250));}
  throw new Error('The CW detail tab did not become available.');
 };
 return {
  async listOpenTickets(resourcesFilter){return send('listRakeOpenTickets',cwTabId,{resourcesFilter});},
  async checkEligible(ticketId,resourcesFilter){$('status').textContent='Checking CW #'+ticketId+' is still open and assigned…';return send('checkRakeEligibility',cwTabId,{ticketId,resourcesFilter});},
  async readIiq(reference) { $('status').textContent = 'Reading ' + reference + ' in IIQ…'; return send('readIiqStatus', iiqTabId, { reference }); },
  async resolveCw(reference) {
   $('status').textContent = 'Matching ' + reference + ' in ConnectWise…';
   const found = await send('findRakeTickets', cwTabId, { ticket: { ...settings, summary: reference, titleContains: reference } });
   return found.matches.filter(row => iiqReferences(row.summary).includes(reference)).map(row => row.ticketId);
  },
  async readCw(ticketId) {
   $('status').textContent = 'Opening CW #' + ticketId + ' and waiting for ticket fields…';
   return send('readRakeTicket', await getDetailTab(), { ticketId, company: settings.company });
  },
  async setCwStatus(ticketId, status) { $('status').textContent = 'Saving CW #' + ticketId + ' → ' + status + '…'; return send('setTicketStatus', await getDetailTab(), { ticketId, status, forceSave: true }); }
 };
}
async function locked(work) {
 if (busy) return;
 await navigator.locks.request('connectwise-helper-browser-run', { ifAvailable: true }, async lock => {
  if (!lock) { $('status').textContent = 'Another helper run is active. Wait for it to finish.'; return; }
  stop = false; busyState(true);
  try { await work(); } catch (error) { $('status').textContent = error.message; log({ ok:false, error:error.message }); }
  finally { busyState(false); render(); }
 });
}
function invalidateScan(){preview=null;lastInput=null;continuing=false;render();persistResults().catch(error=>{$('status').textContent=error.message;});$('status').textContent='Search settings changed. Scan again before applying.';}
$('scope').onchange=()=>{scopeChanged();invalidateScan();};
for(const id of ['resources-filter','limit','origin','input-json'])$(id).addEventListener('change',invalidateScan);
for(const id of ['iiq-tab','cw-tab'])$(id).addEventListener('change',()=>{
 if(id==='cw-tab')detailTabId=null;
 if(preview){continuing=true;render();$('status').textContent='Tab changed. Your preview and selections are preserved. Continue selected changes; tickets are rechecked before saving.';}
});
$('stop').onclick = () => { stop = true; $('status').textContent = 'Stopping after the current ticket. An active save will finish verification.'; };
$('connect').onclick = async () => { try { const site = origin(); const allowed = await chrome.permissions.request({ origins:[site+'/*'] }); if (!allowed) throw new Error('IIQ permission was not granted.'); await chrome.storage.local.set({[configurationKey]:{...(await chrome.storage.local.get(configurationKey))[configurationKey],origin:site,resourcesFilter:$('resources-filter').value.trim()}}); await refreshTabs(); } catch(error) { $('permission-status').textContent = error.message; } };
$('open-iiq').onclick = async () => { try { await chrome.tabs.create({url:origin()+'/agent/dashboard',active:true}); } catch(error) { $('status').textContent=error.message; } };
$('refresh-tabs').onclick = () => refreshTabs().catch(error => { $('status').textContent=error.message; });
$('export').onclick = async () => { try { const data=await input(); const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.download='iiq-rake-references.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000); } catch(error){$('status').textContent=error.message;} };
$('scan').onclick = () => locked(async () => {
 preview=null;lastInput=null;continuing=false;render();
 const browser = await driver(); const plan = await input(browser); if (!plan.tickets.length) throw new Error('No open assigned CW tickets with one IIQ reference were found in this scope.');
 const prior=(await chrome.storage.local.get(configurationKey))[configurationKey]||{};await chrome.storage.local.set({[configurationKey]:{...prior,origin:origin(),resourcesFilter:plan.resourcesFilter}});
 preview = null; render();
 preview = await previewRake(plan, browser, async rows => { preview = { direction:rakeDirection, rows }; render(); log(preview); await persistResults(); }, () => stop);
 await persistResults(); log(preview); $('status').textContent = stop ? 'Scan stopped. Read rows remain available for review.' : 'Scan finished. Review the proposed CW changes; nothing has been saved.';
});
$('apply').onclick = () => locked(async () => {
 const browser=await driver();
 const result=await applyRake(preview,browser,async results=>{log({direction:rakeDirection,results});await persistResults({direction:rakeDirection,results});},()=>stop);
 continuing=!result.ok;await persistResults(result);log(result);
 for(const saved of result.results)if(['saved_verified','already_matched','skipped'].includes(saved.state)){const row=preview.rows.find(row=>row.reference===saved.reference);if(row){if(saved.state!=='skipped')row.cwStatus=saved.targetStatus;row.state=saved.state==='skipped'?'skipped':'unchanged';row.reason=saved.reason||row.reason;row.selected=false;}}
 await persistResults(result);
 $('status').textContent=result.ok?'Selected CW statuses verified. IIQ was not changed.':stop?'Stopped after the current ticket. Review the results before continuing.':'Rake stopped. Review the failed row; prior verified saves remain recorded.';
});
for(const id of ['copy','copy-top'])$(id).onclick=async event=>{
 event.preventDefault();
 const diagnostics={helperVersion:chrome.runtime.getManifest().version,copiedAt:new Date().toISOString(),working:busy,status:$('status').textContent,currentAction,preview,runDetails:$('result').textContent};
 try{await navigator.clipboard.writeText(JSON.stringify(diagnostics,null,2));$(id).title='Rake diagnostics copied';}
 catch(error){$('status').textContent='Copy failed: '+error.message+'. Expand Results and diagnostics to select the text manually.';}
};
const saved=await chrome.storage.local.get([configurationKey,journalKey]);
if(saved[configurationKey]?.origin)$('origin').value=saved[configurationKey].origin;
if(saved[configurationKey]?.resourcesFilter)$('resources-filter').value=saved[configurationKey].resourcesFilter;
if(saved[journalKey]?.preview?.openOnly && saved[journalKey]?.preview?.resourcesFilter){preview=saved[journalKey].preview;continuing=true;log(saved[journalKey]);$('status').textContent='Restored the last scan. Scan again for current statuses, or apply with fresh checks.';render();}
scopeChanged();await refreshTabs().catch(error=>{$('permission-status').textContent=error.message;});

$('sample').onclick=()=>{const link=document.createElement('a');link.href=chrome.runtime.getURL('RAKE-EXAMPLE.json');link.download='iiq-rake-example.json';link.click();};
