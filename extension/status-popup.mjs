import { eodStatuses } from './eod-model.mjs';
const key = 'helperSettings:lastTicketStatus';
const saved = (await chrome.storage.local.get(key))[key];
const initial = eodStatuses.includes(saved) ? saved : 'Working Issue Now';
const fields = ['ticket-complete-after-time', 'current-time-complete'].map((id) => document.getElementById(id));
function select(status) {
  for (const field of fields) {
    for (const option of field.options) option.defaultSelected = option.value === status;
    field.value = status;
  }
}
for (const field of fields) {
  field.replaceChildren();
  for (const status of eodStatuses) field.add(new Option(status, status));
  field.addEventListener('change', async () => {
    const status = field.value; select(status);
    await chrome.storage.local.set({ [key]: status });
  });
}
select(initial);
