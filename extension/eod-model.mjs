import { cleanEodNotes } from './payroll-report.mjs';
import { normalizeEodExtras, renderEodExtras } from './eod-extras.mjs';
export const isDitlTitle = (title) => /(^|\s)ditl(?=\s|$)/i.test(String(title || ''));
export const eodStatuses = ['Scheduled Remote', 'Scheduled Onsite', 'Working Issue Now',
  'Scheduling Required', 'Waiting Parts/Repair', 'Waiting Client Response', 'Waiting on 3rd Party',
  'Waiting for next onsite visit', 'Pending Closure', 'Completed', 'Closed', 'Closed/Client Unresponsive'];

const escape = (value) => String(value).replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function validateEod(record) {
  if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || '') || !record.subject?.trim()
    || !Array.isArray(record.tickets)) throw new Error('Date, subject, and at least one ticket are required.');
  const seen = new Set();
  const tickets = record.tickets.map((ticket) => {
    const ticketId = ticket.ticketId ? Number(ticket.ticketId) : null;
    const titleContains = String(ticket.titleContains || '').trim();
    if (ticketId !== null && (!Number.isSafeInteger(ticketId) || ticketId < 1)) throw new Error('Ticket number must be a positive integer.');
    if (Boolean(ticketId) === Boolean(titleContains)) throw new Error('Each ticket needs either its ConnectWise number or title text, not both.');
    if (/[*?]/.test(titleContains)) throw new Error('Title text must be literal, without search wildcards.');
    if (!eodStatuses.includes(ticket.status)) throw new Error('Choose a supported status for each ticket.');
    if (!String(ticket.notes || '').trim() && !ticket.omitFromEod) throw new Error('Actual work notes are required for each ticket.');
    const key = ticketId ? `id:${ticketId}` : `title:${titleContains.toLowerCase()}`;
    if (seen.has(key)) throw new Error('A ticket reference appears more than once.');
    seen.add(key);
    return { ticketId, titleContains, omitFromEod:ticket.omitFromEod===true || !cleanEodNotes(ticket.notes), status: ticket.status, notes: cleanEodNotes(ticket.notes),
      nextStep: cleanEodNotes(ticket.nextStep) };
  });
  return { date: record.date, subject: record.subject.trim(), ...normalizeEodExtras(record), tickets };
}

export function renderEod(record, verified) {
  const plan = validateEod(record);
  if (verified.length !== plan.tickets.length || verified.some((item, index) =>
    !item.verified || !Number.isSafeInteger(item.ticketId) || item.status !== plan.tickets[index].status)) {
    throw new Error('Every ticket status must be saved and verified before generating the email.');
  }
  const lines = (text) => text.split(/\r?\n/).filter(Boolean).map((line) => `<li>${escape(line)}</li>`).join('');
  return `<h2>${escape(plan.subject)}</h2><p>${escape(plan.date)}</p><table style="border-collapse:collapse;border:1px solid #444;color:#111;background-color:#fff" border="1" cellspacing="0" cellpadding="8"><thead><tr><th style="border:1px solid #444;padding:8px;text-align:left;background-color:#eee">Ticket</th><th style="border:1px solid #444;padding:8px;text-align:left;background-color:#eee">Status</th><th style="border:1px solid #444;padding:8px;text-align:left;background-color:#eee">Notes</th><th style="border:1px solid #444;padding:8px;text-align:left;background-color:#eee">Next Step</th></tr></thead><tbody>${plan.tickets.map((ticket, index) => (ticket.omitFromEod || /payroll\s+wrap/i.test(verified[index].summary || ticket.titleContains) || isDitlTitle(verified[index].summary || ticket.titleContains)) ? '' :
    `<tr><td style="border:1px solid #444;padding:8px;vertical-align:top">${escape(verified[index].summary || ticket.titleContains || 'Ticket')}</td><td style="border:1px solid #444;padding:8px;vertical-align:top">${escape(ticket.status)}</td><td style="border:1px solid #444;padding:8px;vertical-align:top"><ul>${lines(ticket.notes)}</ul></td><td style="border:1px solid #444;padding:8px;vertical-align:top">${ticket.nextStep ? `<ul>${lines(ticket.nextStep)}</ul>` : 'N/A'}</td></tr>`).join('')}${renderEodExtras(plan, true)}</tbody></table>`;
}


