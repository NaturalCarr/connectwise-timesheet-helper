import { defaultPresets } from './workflow.mjs';
import { withTicketOwner } from './owner-settings.mjs';
import { planTicket } from './plan.mjs';
const $ = (id) => document.getElementById(id);
const form = $('ticket-form');
const status = $('ticket-status');
const source = $('ticket-time-fields');
const container = $('ticket-time-entries');
for (const el of source.querySelectorAll('[id]')) el.dataset.field = el.id.replace('ticket-time-', '');
let recordId = null;
let settingsPromise;
const defaults = () => settingsPromise ||= fetch(chrome.runtime.getURL('ticket-settings.json')).then((r) => { if (!r.ok) throw new Error('Ticket settings unavailable.'); return r.json(); });
const fields = () => [...container.querySelectorAll('[data-time-entry]')].filter((el) => !el.hidden);
const input = (row, key) => row.querySelector(`[data-field="${key}"]`);
function readEntries() {
  return fields().map((row) => ({ ...row.entryMetadata, date: input(row,'date').value,
    start: input(row,'start').value, end: input(row,'end').value, notes: input(row,'notes').value.trim(),
    workType: input(row,'work-type').value, workRole: input(row,'work-role').value.trim(), billable: row.entryMetadata?.billable || 'AUTO' }));
}
function summary() {
  $('ticket-final-status-label').hidden = !fields().length;
  fields().forEach((row, index) => { row.querySelector('legend').textContent = `Time entry ${index + 1}`; });
  const school = $('ticket-school').value.trim().toUpperCase();
  const issue = $('ticket-issue').value.trim();
  $('ticket-preview').textContent = `${issue ? `Ticket title: ${school ? school + ' - ' : ''}${issue}` : ''}${fields().length ? `\n${fields().length} time entry/entries; then mark as ${$('ticket-complete-after-time').value}` : ''}`.trim();
}
function addEntry(entry = {}, persist = true) {
  const row = source.hidden ? source : source.cloneNode(true);
  if (row !== source) { row.removeAttribute('id'); row.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id')); row.querySelector('.remove-time-entry')?.remove(); container.append(row); }
  row.hidden = false; row.disabled = false; row.entryMetadata = entry;
  for (const [key, value] of Object.entries({ date: entry.date || '', start: entry.start || '', end: entry.end || '', notes: entry.notes || '', 'work-type': entry.workType || 'Onsite Support', 'work-role': entry.workRole || 'Onsite Engineer', billable: 'AUTO' })) {
    input(row,key).value = value;
  }
  row.querySelector('.remove-time-entry')?.remove();
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-time-entry'; remove.textContent = 'Remove entry';
  remove.onclick = () => { if (row === source) { row.hidden = true; row.disabled = true; } else row.remove(); summary(); void window.popupDraft.save('ticket'); };
  row.append(remove); summary();
  if (persist) void window.popupDraft.save('ticket');
}
function restore(entries = []) {
  for (const row of container.querySelectorAll('[data-time-entry]')) if (row !== source) row.remove();
  source.hidden = true; source.disabled = true;
  entries.forEach((entry) => addEntry(entry, false)); summary();
}
window.ticketEntries = { read: readEntries, restore };
$('ticket-add-time').onclick = () => addEntry();
container.addEventListener('input', () => { summary(); void window.popupDraft.save('ticket'); });
container.addEventListener('change', () => { summary(); void window.popupDraft.save('ticket'); });
for (const id of ['ticket-school','ticket-issue','ticket-complete-after-time']) $(id).addEventListener('input', summary);
$('ticket-complete-after-time').addEventListener('change', summary);
$('ticket-file').addEventListener('change', () => { $('ticket-json').value = ''; });
$('ticket-json').addEventListener('input', () => { $('ticket-file').value = ''; });
$('load-ticket-json').onclick = async () => {
  try {
    const file = $('ticket-file').files?.[0];
    if (file?.size > 1024*1024) throw new Error('JSON must be under 1 MB.');
    const raw = $('ticket-json').value.trim() || (file ? await file.text() : '');
    if (raw.length > 1024*1024) throw new Error('JSON must be under 1 MB.');
    const record = JSON.parse(raw);
    const plan = planTicket(record, await withTicketOwner(await defaults()));
    if (plan.exampleOnly) throw new Error('Example-only JSON cannot be run.');
    $('ticket-school').value = record.school || ''; $('ticket-issue').value = record.issue || '';
    $('ticket-description').value = record.description || ''; $('ticket-existing-id').value = record.existingTicketId || '';
    $('ticket-title-contains').value = record.titleContains || ''; recordId = record.recordId || null;
    restore(record.timeEntries || (record.timeEntry ? [record.timeEntry] : []));
    if (fields().length) { $('ticket-complete-after-time').value = record.finalStatus || (record.completeAfterTime === false ? 'Working Issue Now' : 'Completed'); $('ticket-complete-after-time').dispatchEvent(new Event('change', {bubbles:true})); }
    summary(); await window.popupDraft.save('ticket'); status.textContent = 'JSON loaded. Review the ticket and entries before running.';
  } catch(error) { status.textContent = `JSON not loaded: ${error.message}`; }
};
document.addEventListener('popup-drafts-cleared', () => { recordId = null; restore(); status.textContent = ''; });
form.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const record = { school: $('ticket-school').value.trim(), issue: $('ticket-issue').value.trim(), description: $('ticket-description').value.trim() };
    if ($('ticket-existing-id').value) record.existingTicketId = Number($('ticket-existing-id').value);
    if ($('ticket-title-contains').value.trim()) record.titleContains = $('ticket-title-contains').value.trim();
    if (recordId) record.recordId = recordId;
    const entries = readEntries();
    if (entries.length) { record.timeEntries = entries; record.finalStatus = $('ticket-complete-after-time').value; }
    const plan = planTicket(record, await withTicketOwner(await defaults()));
    const [active] = await chrome.tabs.query({active:true,currentWindow:true});
    const jobId = crypto.randomUUID(); const params = new URLSearchParams({source:'upload',jobId});
    if (active?.url?.startsWith('https://na.myconnectwise.net/')) params.set('tabId',String(active.id));
    const key = `weeklyJob:${jobId}`;
    const batch={mode:'ticket',exampleOnly:false,tickets:[{...plan,timeEntries:plan.timeEntries || (plan.timeEntry?[plan.timeEntry]:[]),completedStatus:entries.length && plan.completeAfterTime ? plan.completedStatus : plan.ticket.status}],totalEntries:entries.length};
    await chrome.storage.local.set({[key]:batch});
    try { await chrome.tabs.create({url:chrome.runtime.getURL(`runner.html#${params}`),active:true}); }
    catch(error) { await chrome.storage.local.remove(key); throw error; }
    status.textContent = 'Runner opened. Each time entry is saved and verified separately.';
  } catch(error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
summary();

let customPresets=[];
async function loadPresets(){customPresets=(await chrome.storage.local.get('timePresets')).timePresets||[];const select=$('time-preset');select.replaceChildren(new Option('Choose a preset',''));for(const preset of [...defaultPresets,...customPresets])select.add(new Option(preset.name,preset.id));}
$('add-preset').onclick=()=>{const preset=[...defaultPresets,...customPresets].find(p=>p.id===$('time-preset').value);if(preset)addEntry({...preset,date:'',start:'',end:''});};
$('save-preset').onclick=async()=>{const entry=readEntries().at(-1);if(!entry){status.textContent='Add a time entry first.';return;}const name=prompt('Name for this preset');if(!name?.trim())return;customPresets.push({id:crypto.randomUUID(),name:name.trim(),notes:entry.notes,workType:entry.workType,workRole:entry.workRole,billable:entry.billable});await chrome.storage.local.set({timePresets:customPresets});await loadPresets();status.textContent='Preset saved without dates or times.';};
$('delete-preset').onclick=async()=>{const id=$('time-preset').value;if(!customPresets.some(p=>p.id===id)){status.textContent='Choose a custom preset to remove.';return;}customPresets=customPresets.filter(p=>p.id!==id);await chrome.storage.local.set({timePresets:customPresets});await loadPresets();};
$('open-run-history').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('history.html'),active:true});
loadPresets().catch(error=>status.textContent=error.message);
