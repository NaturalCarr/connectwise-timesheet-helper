import { isPayrollWrap, workReportNotes } from './payroll-report.mjs';
import { renderEod, isDitlTitle } from './eod-model.mjs';
export function dailyReport(plan, execution) {
  if (plan.mode !== 'daily') return null;
  if (!execution.ok || execution.results?.length !== plan.tickets.length) throw new Error('Daily report requires every ticket to finish successfully.');
  const tickets = execution.results.map((result, index) => {
    const item = plan.tickets[index];
    if (result.ticketStatus !== item.completedStatus || result.entries?.length !== item.timeEntries.length
      || result.entries.some((entry) => !['saved_verified', 'existing_verified'].includes(entry.status))) throw new Error('Daily report contains unverified time or status.');
    return { ticketId: result.ticketId, ...plan.endOfDay.tickets[index], notes:workReportNotes(item,plan.endOfDay.tickets[index].notes), omitFromEod:item.timeEntries.every(isPayrollWrap) };
  });
  const record = { date: plan.date, subject: plan.endOfDay.subject, inventory:plan.endOfDay.inventory, purchases:plan.endOfDay.purchases, tickets };
  const html = renderEod(record, execution.results.map((result) => ({ ticketId: result.ticketId,
    summary: result.summary, status: result.ticketStatus, verified: true })));
  return { ...record, tickets: record.tickets.filter((ticket, index) => !isDitlTitle(execution.results[index].summary) && !ticket.omitFromEod), html };
}

export function reportsByDay(plan, execution) {
  if (plan.mode === 'daily') return [dailyReport(plan, execution)];
  if (!execution.ok || execution.results?.length !== plan.tickets.length) throw new Error('Reports require every ticket to finish successfully.');
  const days = new Map();
  plan.tickets.forEach((item, index) => {
    const result = execution.results[index];
    if (result.ticketStatus !== item.completedStatus || result.entries?.length !== item.timeEntries.length
      || result.entries.some((entry) => !['saved_verified', 'existing_verified'].includes(entry.status))) throw new Error('Report contains unverified time or status.');
    const dates = [...new Set(item.timeEntries.map((entry) => entry.date))];
    for (const date of dates) {
      const entries = item.timeEntries.filter((entry) => entry.date === date && !isPayrollWrap(entry));
      if(!entries.length)continue;
      if (!days.has(date)) days.set(date, []);
      days.get(date).push({
        ticket: { ticketId: result.ticketId, status: result.ticketStatus,
          notes: entries.map((entry) => entry.notes).join('\n'),
          nextStep: entries.map((entry) => entry.followUp || '').filter(Boolean).join('\n') },
        verified: { ticketId: result.ticketId, summary: result.summary, status: result.ticketStatus, verified: true }
      });
    }
  });
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
    const details=plan.endOfDays?.find(day=>day.date===date);
    const record = { date, subject: details?.subject || `End of day update - ${date}`, inventory:details?.inventory,purchases:details?.purchases, tickets: rows.map((row) => row.ticket) };
    return { ...record, tickets: record.tickets.filter((ticket, index) => !isDitlTitle(rows[index].verified.summary)), html: renderEod(record, rows.map((row) => row.verified)) };
  });
}

