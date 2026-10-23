import { openPlannedEod } from './planned-eod.mjs';
import { renderRunReview } from './run-review.mjs';
import { reviewText } from './workflow.mjs';
import { exampleEodHtml, exampleEodFile } from './eod-example.mjs';
import { withTicketOwner } from './owner-settings.mjs';
import { planWeek, planDay } from './plan.mjs';

const fileInput = document.getElementById('week-file');
const textInput = document.getElementById('week-json');
const validateButton = document.getElementById('validate-week');
const runButton = document.getElementById('run-week');
const status = document.getElementById('week-status');
const preview = document.getElementById('week-preview');
let validatedPlan = null;
const eodButton=document.getElementById('preview-json-eod');
eodButton.onclick=async()=>{try{if(validatedPlan)await openPlannedEod(validatedPlan);}catch(error){status.textContent=error.message;}};

for (const [id, path, name] of [
  ['download-weekly-sample', 'WEEKLY-EXAMPLE.json', 'ConnectWise-weekly-sample.json'],
  ['download-daily-sample', 'DAILY-EXAMPLE.json', 'ConnectWise-daily-sample.json']
]) document.getElementById(id).addEventListener('click', async () => {
  try {
    const response = await fetch(chrome.runtime.getURL(path));
    if (!response.ok) throw new Error('Sample JSON could not be loaded.');
    const sample = await response.json();
    if (sample.exampleOnly !== true) throw new Error('The sample is missing its example-only safeguard.');
    const url = URL.createObjectURL(new Blob([JSON.stringify(sample, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Sample downloaded. Replace example content with actual work; exampleOnly: true prevents submission.';
  } catch (error) { status.textContent = `Sample download failed: ${error.message}`; }
});

function clearValidation() {
  validatedPlan = null;
  eodButton.disabled=true;
  runButton.disabled = true;
  status.textContent = '';
  delete status.dataset.state;
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
  status.dataset.state = 'checking';
  status.textContent = 'Checking JSON…';
  validateButton.disabled = true;
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
    eodButton.disabled=false;
    renderRunReview(preview,plan);
    const reportCount = new Set(plan.tickets.flatMap((item) => item.timeEntries.map((entry) => entry.date))).size;
    status.textContent = `Validated ${plan.tickets.length} ticket(s) and ${plan.totalEntries} time entry/entries for ${plan.mode === 'daily' ? plan.date : `${plan.weekStart}–${plan.weekEnd}`}. Daily Report previews for ${reportCount} date(s) are ready now. Use Preview / copy Daily Report from JSON before running. Saved results are verified separately. Nothing has been saved or emailed.`;
    runButton.disabled = false;
    status.dataset.state = 'valid';
    status.textContent = `✓ JSON valid — ${status.textContent}`;
    status.scrollIntoView({ block: 'nearest' });
  } catch (error) {
    status.dataset.state = 'error';
    status.textContent = `✕ JSON invalid — ${error.message}`;
    status.scrollIntoView({ block: 'nearest' });
  } finally {
    validateButton.disabled = false;
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
    await chrome.storage.local.set({ [`weeklyJob:${jobId}`]: validatedPlan });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`runner.html#${params}`), active: true });
    status.textContent = 'Runner opened. It will save and verify tickets/time, then generate one Daily Report email update per date with preview, copy, and download controls. Nothing is emailed automatically.';
  } catch (error) {
    status.textContent = `Could not open the runner: ${error.message}`;
    runButton.disabled = false;
  }
});


document.getElementById('download-eod-sample').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([exampleEodFile], { type: 'text/html' }));
  const link = document.createElement('a'); link.href=url; link.download='ConnectWise-Daily-Report-example.html'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  status.textContent='Example Daily Report downloaded as HTML. Open it to view the bordered email table.';
});
document.getElementById('copy-eod-sample').addEventListener('click', async () => {
  try {
    const preview=document.createElement('div'); preview.innerHTML=exampleEodHtml;
    await navigator.clipboard.write([new ClipboardItem({
      'text/html':new Blob([exampleEodHtml],{type:'text/html'}),
      'text/plain':new Blob([[...preview.querySelectorAll('tr')].map(row=>[...row.children].map(cell=>cell.textContent).join('\t')).join('\n')],{type:'text/plain'})
    })]);
    status.textContent='Example Daily Report copied with table formatting. Paste into your email composer.';
  } catch(error) { status.textContent=`Example Daily Report copy failed: ${error.message}`; }
});


