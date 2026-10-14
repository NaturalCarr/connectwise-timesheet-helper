import { withTicketOwner } from './owner-settings.mjs';
import { chooseConnectWiseTab, mainWorkspaceTab } from './navigation.mjs';
import { planTicket } from './plan.mjs';

const form = document.getElementById('ticket-form');
const school = document.getElementById('ticket-school');
const issue = document.getElementById('ticket-issue');
const description = document.getElementById('ticket-description');
const existingId = document.getElementById('ticket-existing-id');
const titleContains = document.getElementById('ticket-title-contains');
const withTime = document.getElementById('ticket-with-time');
const timeFields = document.getElementById('ticket-time-fields');
const timeDate = document.getElementById('ticket-time-date');
const timeStart = document.getElementById('ticket-time-start');
const timeEnd = document.getElementById('ticket-time-end');
const timeNotes = document.getElementById('ticket-time-notes');
const timeWorkType = document.getElementById('ticket-time-work-type');
const timeWorkRole = document.getElementById('ticket-time-work-role');
const timeBillable = document.getElementById('ticket-time-billable');
const completeAfterTime = document.getElementById('ticket-complete-after-time');
const jsonFile = document.getElementById('ticket-file');
const jsonText = document.getElementById('ticket-json');
const status = document.getElementById('ticket-status');
const preview = document.getElementById('ticket-preview');
let loadedRecordId = null;
let loadedTimeEntry = null;
let settingsPromise;
document.getElementById('open-title-match').addEventListener('click', async () => {
  const button = document.getElementById('open-title-match'); button.disabled = true;
  try {
    const term = titleContains.value.trim();
    if (!term || /[*?]/.test(term)) throw new Error('Enter literal title text without wildcards.');
    const defaults = await withTicketOwner(await settings());
    const tabId = await mainWorkspaceTab(await chooseConnectWiseTab(new URLSearchParams()));
    const send = async (action, fields) => {
      const response = await chrome.runtime.sendMessage({ action, tabId, ...fields });
      if (!response?.ok) throw new Error(response?.error || `${action} failed`);
      return response;
    };
    const found = await send('findTickets', { ticket: { ...defaults, summary: term, titleContains: term } });
    if (found.matches.length !== 1) throw new Error(`Found ${found.matches.length} matching tickets. Use an exact ConnectWise number if ambiguous. No ticket was created.`);
    const ticketId = found.matches[0].ticketId;
    await send('openTicket', { ticketId, ticket: defaults, numberOnly: true });
    status.textContent = `Opened ticket #${ticketId}. Use Time on the current ticket to enter time.`;
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

function settings() {
  settingsPromise ||= fetch(chrome.runtime.getURL('ticket-settings.json')).then((response) => {
    if (!response.ok) throw new Error('Extension ticket defaults could not be loaded.');
    return response.json();
  });
  return settingsPromise;
}

function showSummary() {
  const acronym = school.value.trim().toUpperCase();
  const title = issue.value.trim();
  preview.textContent = acronym && title ? `Ticket title: ${acronym} - ${title}${withTime.checked
    ? `\nOne time entry${'; then mark as ' + completeAfterTime.value}` : ''}` : '';
}

function updateTimeFields() {
  timeFields.hidden = !withTime.checked;
  timeFields.disabled = !withTime.checked;
  if (!withTime.checked) loadedTimeEntry = null;
  showSummary();
}

for (const input of [school, issue, description, existingId]) {
  input.addEventListener('input', () => { loadedRecordId = null; showSummary(); });
}
withTime.addEventListener('change', updateTimeFields);
completeAfterTime.addEventListener('change', showSummary);
jsonFile.addEventListener('change', () => { jsonText.value = ''; });
jsonText.addEventListener('input', () => { jsonFile.value = ''; });

document.getElementById('load-ticket-json').addEventListener('click', async () => {
  try {
    const file = jsonFile.files?.[0];
    if (file && file.size > 1024 * 1024) throw new Error('The JSON file must be under 1 MB.');
    const raw = jsonText.value.trim() || (file ? await file.text() : '');
    if (!raw.trim()) throw new Error('Paste ticket JSON or select a .json file.');
    if (raw.length > 1024 * 1024) throw new Error('The JSON text must be under 1 MB.');
    const record = JSON.parse(raw);
    const plan = planTicket(record, await withTicketOwner(await settings()));
    if (plan.exampleOnly) throw new Error('Example-only ticket JSON cannot be run.');
    school.value = record.school.trim().toUpperCase();
    issue.value = record.issue.trim();
    description.value = record.description ?? '';
    existingId.value = record.existingTicketId ?? '';
    titleContains.value = record.titleContains ?? '';
    loadedRecordId = record.recordId || null;
    loadedTimeEntry = record.timeEntry || null;
    withTime.checked = Boolean(record.timeEntry);
    timeDate.value = record.timeEntry?.date || '';
    timeStart.value = record.timeEntry?.start || '';
    timeEnd.value = record.timeEntry?.end || '';
    timeNotes.value = record.timeEntry?.notes || '';
    timeWorkType.value = record.timeEntry?.workType || 'Onsite Support';
    timeWorkRole.value = record.timeEntry?.workRole || 'Onsite Engineer';
    timeBillable.value = 'AUTO';
    completeAfterTime.value = record.finalStatus || (record.completeAfterTime === false ? 'Working Issue Now' : 'Completed');
    completeAfterTime.dispatchEvent(new Event('change', { bubbles: true }));
    updateTimeFields();
    showSummary();
    await window.popupDraft.save('ticket');
    status.textContent = `Loaded ${plan.ticket.summary}${plan.timeEntry ? ' with one time entry' : ''}. Review the form, then run it.`;
  } catch (error) {
    status.textContent = `Ticket JSON was not loaded: ${error.message}`;
  }
});

document.addEventListener('popup-drafts-cleared', () => {
  loadedRecordId = null;
  loadedTimeEntry = null;
  updateTimeFields();
  status.textContent = '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const record = {
      school: school.value.trim().toUpperCase(), issue: issue.value.trim(),
      description: description.value.trim()
    };
    if (existingId.value) record.existingTicketId = Number(existingId.value);
    if (titleContains.value.trim()) record.titleContains = titleContains.value.trim();
    if (loadedRecordId) record.recordId = loadedRecordId;
    if (withTime.checked) {
      record.timeEntry = { ...loadedTimeEntry, date: timeDate.value, start: timeStart.value,
        end: timeEnd.value, notes: timeNotes.value.trim(), workType: timeWorkType.value.trim(),
        workRole: timeWorkRole.value.trim(), billable: timeBillable.value };
      record.finalStatus = completeAfterTime.value;
    }
    const plan = planTicket(record, await withTicketOwner(await settings()));
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    const jobId = crypto.randomUUID();
    const params = new URLSearchParams({ source: 'upload', jobId });
    if (active?.id && active.url?.startsWith('https://na.myconnectwise.net/')) {
      params.set('tabId', String(active.id));
    }
    const key = `ticketJob:${jobId}`;
    await chrome.storage.session.set({ [key]: plan });
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL(`ticket-runner.html#${params}`), active: true });
    } catch (error) {
      await chrome.storage.session.remove(key);
      throw error;
    }
    status.textContent = 'Ticket runner opened. It will report the saved ticket and time result or why it stopped.';
  } catch (error) {
    status.textContent = `Could not start ticket run: ${error.message}`;
    button.disabled = false;
  }
});




