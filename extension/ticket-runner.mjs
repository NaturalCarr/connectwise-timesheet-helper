import { applyTicketOwner } from './owner-settings.mjs';
import { executeTicket } from './execute-ticket.mjs';
import { chooseConnectWiseTab, mainWorkspaceTab } from './navigation.mjs';

const status = document.getElementById('status');
const output = document.getElementById('result');
const showTicket = document.getElementById('show-ticket');
const params = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, '', location.pathname);

async function send(action, tabId, fields = {}) {
  const result = await chrome.runtime.sendMessage({ action, tabId, ...fields });
  if (!result?.ok) {
    const error = new Error(result?.error || `${action} failed.`);
    if (Number.isSafeInteger(result?.ticketId)) error.ticketId = result.ticketId;
    throw error;
  }
  return result;
}

async function loadPlan() {
  if (params.get('source') === 'upload') {
    const jobId = params.get('jobId');
    if (!/^[0-9a-f-]{36}$/i.test(jobId || '')) throw new Error('The ticket job ID is invalid.');
    const key = `ticketJob:${jobId}`;
    const plan = (await chrome.storage.session.get(key))[key];
    await chrome.storage.session.remove(key);
    return { plan, report: null };
  }
  const port = Number(params.get('port'));
  const token = params.get('token');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || !/^[a-f0-9]{64}$/.test(token || '')) {
    throw new Error('The local ticket job address is invalid.');
  }
  const base = `http://127.0.0.1:${port}`;
  const response = await fetch(`${base}/job?token=${token}`);
  if (!response.ok) throw new Error(`Local ticket job server returned ${response.status}.`);
  const { plan } = await response.json();
  const report = (result) => fetch(`${base}/result?token=${token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result)
  });
  return { plan, report };
}

async function main() {
  const { plan, report } = await loadPlan();
  if (!plan?.ticket || plan.exampleOnly || !Array.isArray(plan.steps)) {
    throw new Error('The record is not a submittable ticket-only plan.');
  }
  await applyTicketOwner(plan);
  const tabId = await mainWorkspaceTab(await chooseConnectWiseTab(params),
    (message) => { status.textContent = message; });
  const driver = {
    async findTickets(ticket) {
      status.textContent = `Searching for ${ticket.summary}…`;
      return (await send('findTickets', tabId, { ticket })).matches;
    },
    async createTicket(ticket) {
      status.textContent = `Creating ${ticket.summary}…`;
      return (await send('createTicket', tabId, { ticket })).ticketId;
    },
    async openTicket(ticketId, ticket, lookup = {}) {
      return (await send('openTicket', tabId, { ticketId, ticket, numberOnly: lookup.numberOnly === true })).verified;
    },
    async ensureTicketOwner(ticketId, owner) {
      status.textContent = `Verifying Ticket Owner on #${ticketId}…`;
      return (await send('ensureTicketOwner', tabId, { ticketId, owner })).verified;
    },
    async setTicketStatus(ticketId, ticketStatus) {
      status.textContent = `Setting ticket #${ticketId} to ${ticketStatus}…`;
      await send('setTicketStatus', tabId, { ticketId, status: ticketStatus });
    },
    async verifyTicketStatus(ticketId, ticketStatus) {
      return (await send('verifyTicketStatus', tabId, { ticketId, status: ticketStatus })).verified;
    },
    async findTimeEntries(ticketId, entry) {
      const result = await send('findTimeEntries', tabId, { ticketId, entry });
      this.baselineTimeCount = result.total;
      return result.matches;
    },
    async openNewTimeEntry(ticketId) {
      return (await send('openNewTimeEntry', tabId, { ticketId })).ok;
    },
    async fillTimeEntry(ticketId, entry) {
      status.textContent = `Preparing ${entry.date} ${entry.start}–${entry.end} on ticket #${ticketId}…`;
      this.prepared = await send('prepareTimeDraft', tabId, { ticketId, entry });
    },
    async verifyTimeDraft(ticketId, entry) {
      return (await send('verifyPreparedTime', tabId,
        { ticketId, frameId: this.prepared?.frameId, entry })).verified;
    },
    async saveTimeEntry(ticketId, entry) {
      status.textContent = `Saving ${entry.date} ${entry.start}–${entry.end} on ticket #${ticketId}…`;
      await send('savePreparedTime', tabId,
        { ticketId, frameId: this.prepared?.frameId, entry,
          baselineTimeCount: this.baselineTimeCount });
    },
    async verifyTimeEntry(ticketId, entry) {
      const saved = await send('verifySavedTime', tabId,
        { ticketId, entry, baselineTimeCount: this.baselineTimeCount });
      return { verified: saved.verified, timeId: saved.row?.timeId || null };
    }
  };
  const result = await executeTicket(plan, driver);
  if (result.ok) await chrome.storage.local.remove('popupDraft:ticket').catch(() => {});
  output.textContent = JSON.stringify(result, null, 2);
  status.textContent = result.ok
    ? `Ticket #${result.ticketId}${result.entry ? ' and its time entry' : ''} verified; status ${result.ticketStatus}.`
    : 'Ticket run stopped. Review the result below; a ticket or time entry may already have been saved.';
  if (result.ticketId) {
    showTicket.hidden = false;
    showTicket.addEventListener('click', () => chrome.tabs.update(tabId, { active: true }));
  }
  if (report) await report(result);
}

main().catch(async (error) => {
  const result = { ok: false, status: 'stopped', error: error.message };
  status.textContent = 'Ticket run stopped.';
  output.textContent = JSON.stringify(result, null, 2);
  const port = Number(params.get('port'));
  const token = params.get('token');
  if (Number.isSafeInteger(port) && /^[a-f0-9]{64}$/.test(token || '')) {
    await fetch(`http://127.0.0.1:${port}/result?token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result)
    }).catch(() => {});
  }
});

