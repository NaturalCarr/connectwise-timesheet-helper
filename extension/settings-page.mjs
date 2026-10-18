import { configKey, configFields, validateDefaults, configuredDefaults } from './config-settings.mjs';
import { ownerKey } from './owner-settings.mjs';
const form = document.getElementById('settings'), status = document.getElementById('status');
try {
 const response = await fetch(chrome.runtime.getURL('ticket-settings.json'));
 if (!response.ok) throw new Error('Could not load defaults.');
 const settings = await configuredDefaults(await response.json());
 for (const key of configFields) {
  const label = document.createElement('label'); label.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
  const input = document.createElement('input'); input.name = key; input.required = true; input.value = settings[key] || ''; label.append(input); document.getElementById('fields').append(label);
 }
} catch(error) { status.textContent = error.message; }
const read = () => validateDefaults(Object.fromEntries(new FormData(form)));
form.addEventListener('submit', async event => {
 event.preventDefault();
 try { await chrome.storage.local.set({ [configKey]: read() }); status.textContent = 'Configuration saved. Reopen the popup and validate your JSON again. Existing run plans keep their original settings.'; }
 catch(error) { status.textContent = error.message; }
});
document.getElementById('export').addEventListener('click', async () => {
 try {
 const owner = (await chrome.storage.local.get(ownerKey))[ownerKey] || '';
 const url = URL.createObjectURL(new Blob([JSON.stringify({...read(), owner}, null, 2) + '\n'], {type:'application/json'}));
 const a = document.createElement('a'); a.href = url; a.download = 'ticket-settings.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
 } catch(error) { status.textContent = error.message; }
});
