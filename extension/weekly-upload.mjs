import { withTicketOwner } from './owner-settings.mjs';
import { planWeek, planDay } from './plan.mjs';

const fileInput = document.getElementById('week-file');
const textInput = document.getElementById('week-json');
const validateButton = document.getElementById('validate-week');
const runButton = document.getElementById('run-week');
const status = document.getElementById('week-status');
const preview = document.getElementById('week-preview');
let validatedPlan = null;

function clearValidation() {
  validatedPlan = null;
  runButton.disabled = true;
  status.textContent = '';
  preview.textContent = '';
}

document.addEventListener('popup-drafts-cleared', clearValidation);
document.addEventListener('ticket-owner-changed', clearValidation);

fileInput.addEventListener('change', () => {
  textInput.value = '';
  clearValidation();
});
textInput.addEventListener('input', () => {
  fileInput.value = '';
  clearValidation();
});

validateButton.addEventListener('click', async () => {
  clearValidation();
  try {
    const file = fileInput.files?.[0];
    if (file && file.size > 1024 * 1024) throw new Error('The JSON file must be under 1 MB.');
    const raw = textInput.value.trim() || (file ? await file.text() : '');
    if (!raw.trim()) throw new Error('Paste a weekly JSON record or select a .json file.');
    if (raw.length > 1024 * 1024) throw new Error('The JSON text must be under 1 MB.');
    const record = JSON.parse(raw);
    const response = await fetch(chrome.runtime.getURL('ticket-settings.json'));
    if (!response.ok) throw new Error('Extension ticket defaults could not be loaded.');
    const plan = (record.date ? planDay : planWeek)(record, await withTicketOwner(await response.json()));
    if (plan.exampleOnly) throw new Error('Example-only JSON cannot be run in ConnectWise.');
    validatedPlan = plan;
    preview.textContent = plan.tickets.map(({ ticket, timeEntries }) =>
      `${ticket.summary}\n${timeEntries.map((entry) =>
        `  ${entry.date} ${entry.start}–${entry.end} ${entry.billable}: ${entry.notes}`).join('\n')}`
    ).join('\n\n');
    status.textContent = `Validated ${plan.tickets.length} ticket(s) and ${plan.totalEntries} time entry/entries for ${plan.mode === 'daily' ? plan.date : `${plan.weekStart}–${plan.weekEnd}`}. Nothing has been saved.`;
    runButton.disabled = false;
  } catch (error) {
    status.textContent = `Validation failed: ${error.message}`;
  }
});

runButton.addEventListener('click', async () => {
  if (!validatedPlan) return;
  runButton.disabled = true;
  try {
    const jobId = crypto.randomUUID();
    const params = new URLSearchParams({ source: 'upload', jobId });
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id && active.url?.startsWith('https://na.myconnectwise.net/')) {
      params.set('tabId', String(active.id));
    }
    await chrome.storage.session.set({ [`weeklyJob:${jobId}`]: validatedPlan });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`runner.html#${params}`), active: true });
    status.textContent = 'Weekly runner opened. Its tab will report each saved or stopped step.';
  } catch (error) {
    status.textContent = `Could not open the runner: ${error.message}`;
    runButton.disabled = false;
  }
});

