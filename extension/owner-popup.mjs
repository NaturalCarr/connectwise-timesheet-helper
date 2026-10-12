import { ownerKey } from './owner-settings.mjs';

const form = document.getElementById('owner-settings-form');
const input = document.getElementById('ticket-owner-setting');
const status = document.getElementById('owner-settings-status');
const saved = (await chrome.storage.local.get(ownerKey))[ownerKey];
input.value = typeof saved === 'string' ? saved : '';
status.textContent = input.value ? 'Saved owner. Change it here only when needed.' : 'Required before running work.';
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!input.value.trim()) { input.setCustomValidity('Enter your exact ConnectWise display name.'); input.reportValidity(); return; }
  try {
    await chrome.storage.local.set({ [ownerKey]: input.value.trim() });
    status.textContent = 'Ticket Owner saved. Clear saved inputs will not remove it.';
    document.dispatchEvent(new Event('ticket-owner-changed'));
  } catch (error) { status.textContent = `Could not save owner: ${error.message}`; }
});
input.addEventListener('input', () => input.setCustomValidity(''));
