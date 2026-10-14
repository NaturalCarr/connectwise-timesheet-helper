import { eodStatuses, validateEod, renderEod } from './eod-model.mjs';
import { withTicketOwner } from './owner-settings.mjs';
import { mainWorkspaceTab } from './navigation.mjs';
const $ = (id) => document.getElementById(id);
const storageKey = 'eodDraft';
let html = '';
let busy = false;
function row(ticket = {}) {
  const field = document.createElement('fieldset');
  field.innerHTML = '<legend>Ticket</legend><label>ConnectWise ticket number<input class="id" type="number" min="1"></label><label>Or title contains<input class="title" placeholder="Other platform reference, for example T-90463"></label><label>Status<select class="state"></select></label><label>Work notes (one point per line)<textarea class="notes"></textarea></label><label>Next step (optional)<textarea class="next"></textarea></label><button class="remove">Remove ticket</button>';
  for (const value of eodStatuses) field.querySelector('.state').add(new Option(value, value));
  field.querySelector('.id').value = ticket.ticketId || '';
  field.querySelector('.title').value = ticket.titleContains || '';
  field.querySelector('.state').value = ticket.status || 'Working Issue Now';
  field.querySelector('.notes').value = ticket.notes || '';
  field.querySelector('.next').value = ticket.nextStep || '';
  field.querySelector('.remove').onclick = () => { if (!busy) { field.remove(); changed(); } };
  $('tickets').append(field);
}
function record() {
  return { date: $('eod-date').value, subject: $('eod-subject').value,
    tickets: [...$('tickets').children].map((field) => ({
      ticketId: field.querySelector('.id').value ? Number(field.querySelector('.id').value) : null,
      titleContains: field.querySelector('.title').value, status: field.querySelector('.state').value,
      notes: field.querySelector('.notes').value, nextStep: field.querySelector('.next').value })) };
}
let queue = Promise.resolve();
function changed() {
  html = ''; $('preview').replaceChildren(); $('copy-email').disabled = true; $('download').disabled = true;
  const draft = record();
  queue = queue.catch(() => {}).then(() => chrome.storage.local.set({ [storageKey]: draft }));
  queue.catch((error) => { $('status').textContent = `Draft storage failed: ${error.message}`; });
}
document.addEventListener('input', changed);
document.addEventListener('change', changed);
$('add').onclick = () => { if (!busy) { row(); changed(); } };
const saved = (await chrome.storage.local.get(storageKey))[storageKey];
if (saved) { $('eod-date').value = saved.date || ''; $('eod-subject').value = saved.subject || ''; saved.tickets?.forEach(row); }
else { const now = new Date(); $('eod-date').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
if (!$('tickets').children.length) row();
async function send(action, tabId, fields) {
  const response = await chrome.runtime.sendMessage({ action, tabId, ...fields });
  if (!response?.ok) throw new Error(response?.error || `${action} failed`);
  return response;
}
$('run').onclick = async () => {
  if (busy) return;
  html = ''; $('preview').replaceChildren(); $('copy-email').disabled = true; $('download').disabled = true;
  const results = [];
  busy = true;
  document.querySelectorAll('input,textarea,select,button').forEach((el) => { el.disabled = true; });
  try {
    const plan = validateEod(record());
    const response = await fetch(chrome.runtime.getURL('ticket-settings.json'));
    const settings = await withTicketOwner(await response.json());
    const selected = (await chrome.storage.local.get('connectwiseTabId')).connectwiseTabId;
    const candidates = await chrome.tabs.query({ url: 'https://na.myconnectwise.net/*' });
    const initial = candidates.find((tab) => tab.id === selected) || (candidates.length === 1 ? candidates[0] : null);
    if (!initial) throw new Error('Select the intended ConnectWise tab in the helper first.');
    const tabId = await mainWorkspaceTab(initial.id, (text) => { $('status').textContent = text; });
    const seen = new Set();
    // Resolve every reference before the first status write.
    const resolved = [];
    for (const ticket of plan.tickets) {
      let id = ticket.ticketId;
      let summary = '';
      if (!id) {
        const found = await send('findTickets', tabId, { ticket: { ...settings, summary: ticket.titleContains, titleContains: ticket.titleContains } });
        if (found.matches.length !== 1) throw new Error(`Title reference ${ticket.titleContains} matched ${found.matches.length} tickets. Choose an exact number.`);
        id = found.matches[0].ticketId; summary = found.matches[0].summary || '';
      }
      if (seen.has(id)) throw new Error(`Ticket #${id} appears more than once after lookup.`);
      seen.add(id); resolved.push({ ticketId: id, summary, status: ticket.status });
    }
    for (const ticket of resolved) {
      $('status').textContent = `Saving ${ticket.status} on #${ticket.ticketId}…`;
      await send('openTicket', tabId, { ticketId: ticket.ticketId, ticket: settings, numberOnly: true });
      const actual = await send('inspectTicket', tabId, { ticketId: ticket.ticketId });
      ticket.summary = actual.summary || ticket.summary;
      const savedStatus = await send('setTicketStatus', tabId, { ticketId: ticket.ticketId, status: ticket.status, forceSave: true });
      if (!savedStatus.saved) throw new Error(`Ticket #${ticket.ticketId} status save was not verified.`);
      results.push({ ...ticket, verified: true });
      $('result').textContent = JSON.stringify(results, null, 2);
    }
    html = renderEod(plan, results); $('preview').innerHTML = html;
    $('status').textContent = 'All ticket statuses saved and verified. Email ready to copy; nothing was sent.';
  } catch (error) { $('status').textContent = `Stopped: ${error.message}`; $('result').textContent = JSON.stringify(results, null, 2); }
  finally { busy = false; document.querySelectorAll('input,textarea,select,button').forEach((el) => { el.disabled = false; }); $('copy-email').disabled = !html; $('download').disabled = !html; }
};
$('copy-email').onclick = async () => {
  try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([$('preview').innerText], { type: 'text/plain' }) })]); $('status').textContent = 'Copied. Paste into your email composer and review before sending.'; }
  catch (error) { $('status').textContent = `Copy failed: ${error.message}. Use Download HTML.`; }
};
$('download').onclick = () => { const url = URL.createObjectURL(new Blob([html], { type: 'text/html' })); const link = document.createElement('a'); link.href = url; link.download = `end-of-day-${$('eod-date').value}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
