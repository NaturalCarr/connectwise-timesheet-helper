import { applyTicketOwner } from './owner-settings.mjs';
import { executePlan } from './execute-plan.mjs';
import { chooseConnectWiseTab, mainWorkspaceTab } from './navigation.mjs';

const status = document.getElementById('status');
const output = document.getElementById('result');
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

async function main() {
  let reportResult = null;
  let plan;
  if (params.get('source') === 'upload') {
    const jobId = params.get('jobId');
    if (!/^[0-9a-f-]{36}$/i.test(jobId || '')) throw new Error('The uploaded job ID is invalid.');
    const key = `weeklyJob:${jobId}`;
    plan = (await chrome.storage.session.get(key))[key];
    await chrome.storage.session.remove(key);
  } else {
  const port = Number(params.get('port'));
  const token = params.get('token');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || !/^[a-f0-9]{64}$/.test(token || '')) {
    throw new Error('The local job address is invalid.');
  }
  const base = `http://127.0.0.1:${port}`;
  const jobUrl = `${base}/job?token=${token}`;
  const response = await fetch(jobUrl);
  if (!response.ok) throw new Error(`Local job server returned ${response.status}.`);
  ({ plan } = await response.json());
  reportResult = (result) => fetch(`${base}/result?token=${token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result)
  });
  }
  if (!plan || plan.exampleOnly || !Array.isArray(plan.tickets)) {
    throw new Error('The work record is not a submittable weekly plan.');
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
      const result = await send('verifySavedTime', tabId,
        { ticketId, entry, baselineTimeCount: this.baselineTimeCount });
      return { verified: result.verified, timeId: result.row?.timeId || null };
    }
  };
  const result = await executePlan(plan, driver);
  if (result.ok) await chrome.storage.local.remove('popupDraft:week').catch(() => {});
  output.textContent = JSON.stringify(result, null, 2);
  status.textContent = result.ok ? 'Weekly run saved and verified.' : 'Weekly run stopped. Review the result below.';
  if (reportResult) await reportResult(result);
}

main().catch(async (error) => {
  const result = { ok: false, error: error.message };
  status.textContent = 'Weekly run stopped.';
  output.textContent = JSON.stringify(result, null, 2);
  const port = Number(params.get('port'));
  const token = params.get('token');
  if (Number.isSafeInteger(port) && /^[a-f0-9]{64}$/.test(token || '')) {
    await fetch(`http://127.0.0.1:${port}/result?token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result)
    }).catch(() => {});
  }
});

