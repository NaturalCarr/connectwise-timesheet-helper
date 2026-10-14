export const eodStatuses = ['Scheduled Remote', 'Scheduled Onsite', 'Working Issue Now',
  'Scheduling Required', 'Waiting Parts/Repair', 'Waiting Client Response', 'Waiting on 3rd Party',
  'Waiting for next onsite visit', 'Pending Closure', 'Completed', 'Closed', 'Closed/Client Unresponsive'];

const escape = (value) => String(value).replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function validateEod(record) {
  if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || '') || !record.subject?.trim()
    || !Array.isArray(record.tickets) || !record.tickets.length) throw new Error('Date, subject, and at least one ticket are required.');
  const seen = new Set();
  const tickets = record.tickets.map((ticket) => {
    const ticketId = ticket.ticketId ? Number(ticket.ticketId) : null;
    const titleContains = String(ticket.titleContains || '').trim();
    if (ticketId !== null && (!Number.isSafeInteger(ticketId) || ticketId < 1)) throw new Error('Ticket number must be a positive integer.');
    if (Boolean(ticketId) === Boolean(titleContains)) throw new Error('Each ticket needs either its ConnectWise number or title text, not both.');
    if (/[*?]/.test(titleContains)) throw new Error('Title text must be literal, without search wildcards.');
    if (!eodStatuses.includes(ticket.status)) throw new Error('Choose a supported status for each ticket.');
    if (!String(ticket.notes || '').trim()) throw new Error('Actual work notes are required for each ticket.');
    const key = ticketId ? `id:${ticketId}` : `title:${titleContains.toLowerCase()}`;
    if (seen.has(key)) throw new Error('A ticket reference appears more than once.');
    seen.add(key);
    return { ticketId, titleContains, status: ticket.status, notes: String(ticket.notes).trim(),
      nextStep: String(ticket.nextStep || '').trim() };
  });
  return { date: record.date, subject: record.subject.trim(), tickets };
}

export function renderEod(record, verified) {
  const plan = validateEod(record);
  if (verified.length !== plan.tickets.length || verified.some((item, index) =>
    !item.verified || !Number.isSafeInteger(item.ticketId) || item.status !== plan.tickets[index].status)) {
    throw new Error('Every ticket status must be saved and verified before generating the email.');
  }
  const lines = (text) => text.split(/\r?\n/).filter(Boolean).map((line) => `<li>${escape(line)}</li>`).join('');
  return `<h2>${escape(plan.subject)}</h2><p>${escape(plan.date)}</p><table style="border-collapse:collapse" border="1" cellpadding="8"><thead><tr><th>Ticket</th><th>Status</th><th>Notes</th><th>Next Step</th></tr></thead><tbody>${plan.tickets.map((ticket, index) =>
    `<tr><td>#${verified[index].ticketId} - ${escape(verified[index].summary || ticket.titleContains || '')}</td><td>${escape(ticket.status)}</td><td><ul>${lines(ticket.notes)}</ul></td><td>${ticket.nextStep ? `<ul>${lines(ticket.nextStep)}</ul>` : 'N/A'}</td></tr>`).join('')}</tbody></table>`;
}
