import { configuredDefaults } from './config-settings.mjs';
import { eodStatuses } from './eod-model.mjs';
import { requireTicketOwner } from './owner-settings.mjs';
import { planTimeEntry } from './plan.mjs';
import { executeCurrentTime } from './execute-current-time.mjs';

const status = document.getElementById('status');
const output = document.getElementById('result');
const showTicket = document.getElementById('show-ticket');

async function send(action, tabId, fields = {}) {
  const result = await chrome.runtime.sendMessage({ action, tabId, ...fields });
  if (!result?.ok) throw new Error(result?.error || `${action} failed.`);
  return result;
}

async function main() {
  await requireTicketOwner();
  const jobId = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('Time job ID is invalid.');
  const key = `currentTimeJob:${jobId}`;
  const job = (await chrome.storage.session.get(key))[key];
  await chrome.storage.session.remove(key);
  if (!job || !Number.isInteger(job.tabId)) throw new Error('The time job is missing.');
  const settingsResponse = await fetch(chrome.runtime.getURL('ticket-settings.json'));
  if (!settingsResponse.ok) throw new Error('Ticket settings could not be loaded.');
  const settings = await configuredDefaults(await settingsResponse.json());
  const entry = planTimeEntry(job.entry, settings.status);
  const tabId = job.tabId;
  let baselineTimeCount = null;
  const driver = {
    async identifyCurrentTicket() {
      status.textContent = 'Reading the current ticket…';
      return send('identifyCurrentTicket', tabId);
    },
    async verifyCompanySite(ticketId) {
      status.textContent = `Checking ticket #${ticketId}…`;
      await send('verifyCurrentTicketCompanySite', tabId,
        { ticketId, company: settings.company, site: settings.site });
    },
    async setTicketStatus(ticketId, ticketStatus) {
      status.textContent = `Setting ticket #${ticketId} to ${ticketStatus}…`;
      await send('setTicketStatus', tabId, { ticketId, status: ticketStatus });
    },
    async verifyTicketStatus(ticketId, ticketStatus) {
      const result = await send('verifyTicketStatus', tabId, { ticketId, status: ticketStatus });
      if (!result.verified) {
        throw new Error(`Ticket #${ticketId} status readback was ${result.status || '(unreadable)'}; expected ${ticketStatus}.`);
      }
      return true;
    },
    async findTimeEntries(ticketId, timeEntry) {
      status.textContent = `Checking ticket #${ticketId} for duplicate time…`;
      const result = await send('findTimeEntries', tabId, { ticketId, entry: timeEntry });
      baselineTimeCount = result.total;
      return result.matches;
    },
    async openNewTimeEntry(ticketId) {
      await send('openNewTimeEntry', tabId, { ticketId });
    },
    async prepareTimeDraft(ticketId, timeEntry) {
      status.textContent = `Preparing time on ticket #${ticketId}…`;
      return send('prepareTimeDraft', tabId, { ticketId, entry: timeEntry });
    },
    async verifyTimeDraft(ticketId, frameId, timeEntry) {
      return (await send('verifyPreparedTime', tabId,
        { ticketId, frameId, entry: timeEntry })).verified;
    },
    async saveTimeEntry(ticketId, frameId, timeEntry) {
      status.textContent = `Saving time on ticket #${ticketId}…`;
      await send('savePreparedTime', tabId,
        { ticketId, frameId, entry: timeEntry, baselineTimeCount });
    },
    async verifyTimeEntry(ticketId, timeEntry) {
      return send('verifySavedTime', tabId, { ticketId, entry: timeEntry, baselineTimeCount });
    }
  };
  const finalStatus = job.finalStatus || (job.completeAfterTime ? 'Completed' : 'Working Issue Now');
  if (!eodStatuses.includes(finalStatus)) throw new Error('Unsupported final ticket status.');
  const result = await executeCurrentTime(entry, Boolean(job.finalStatus) || job.completeAfterTime === true, driver, finalStatus);
  if (result.ok) await chrome.storage.local.remove('popupDraft:time').catch(() => {});
  output.textContent = JSON.stringify(result, null, 2);
  status.textContent = result.ok
    ? `Ticket #${result.ticketId}: ${result.entry.status}${result.ticketStatus ? `; ticket status ${result.ticketStatus}` : ''}.`
    : 'Time run stopped. Review the result; a ticket status or time row may already have been saved.';
  if (result.ticketId) {
    showTicket.hidden = false;
    showTicket.addEventListener('click', () => chrome.tabs.update(tabId, { active: true }));
  }
}

main().catch((error) => {
  status.textContent = 'Time run stopped.';
  output.textContent = JSON.stringify({ ok: false, status: 'stopped', error: error.message }, null, 2);
});


