import { renderEod } from './eod-model.mjs';
export function dailyReport(plan, execution) {
  if (plan.mode !== 'daily') return null;
  if (!execution.ok || execution.results?.length !== plan.tickets.length) throw new Error('Daily report requires every ticket to finish successfully.');
  const tickets = execution.results.map((result, index) => {
    const item = plan.tickets[index];
    if (result.ticketStatus !== item.completedStatus || result.entries?.length !== item.timeEntries.length
      || result.entries.some((entry) => !['saved_verified', 'existing_verified'].includes(entry.status))) throw new Error('Daily report contains unverified time or status.');
    return { ticketId: result.ticketId, ...plan.endOfDay.tickets[index] };
  });
  const record = { date: plan.date, subject: plan.endOfDay.subject, tickets };
  const html = renderEod(record, execution.results.map((result) => ({ ticketId: result.ticketId,
    summary: result.summary, status: result.ticketStatus, verified: true })));
  return { ...record, html };
}
