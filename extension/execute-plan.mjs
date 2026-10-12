// Browser drivers implement these operations against visible ConnectWise controls.
// This module owns sequencing and never treats a click as proof of a save.
export async function executePlan(plan, driver) {
  if (!plan || !Array.isArray(plan.tickets)) throw new Error('A validated weekly plan is required.');
  if (plan.exampleOnly) throw new Error('Example-only work cannot be submitted.');
  if (!driver || typeof driver !== 'object') throw new Error('A browser driver is required.');
  const required = ['findTickets', 'createTicket', 'openTicket', 'ensureTicketOwner', 'setTicketStatus',
    'verifyTicketStatus', 'findTimeEntries', 'openNewTimeEntry', 'fillTimeEntry',
    'verifyTimeDraft', 'saveTimeEntry', 'verifyTimeEntry'];
  for (const method of required) {
    if (typeof driver[method] !== 'function') throw new Error(`Browser driver lacks ${method}.`);
  }
  const results = [];
  for (const item of plan.tickets) {
    const result = { recordId: item.recordId || null, summary: item.ticket.summary,
      ticketId: null, status: 'pending', entries: [] };
    results.push(result);
    try {
      let ticketId;
      if (item.existingTicketId) {
        ticketId = item.existingTicketId;
      } else {
        const matches = await driver.findTickets(item.ticket);
        if (!Array.isArray(matches)) throw new Error('Ticket search was not verified.');
        if (matches.length > 1) throw new Error('Multiple matching tickets; choose one before continuing.');
        ticketId = matches.length === 1 ? matches[0].ticketId : await driver.createTicket(item.ticket);
      }
      if (!Number.isSafeInteger(ticketId) || ticketId <= 0) throw new Error('A saved ticket ID was not verified.');
      result.ticketId = ticketId;
      const opened = await driver.openTicket(ticketId, item.ticket, { numberOnly: Boolean(item.existingTicketId) });
      if (opened !== true) throw new Error(`Ticket #${ticketId} identity was not verified.`);
      if (await driver.ensureTicketOwner(ticketId, item.ticket.owner) !== true) {
        throw new Error(`Ticket #${ticketId} Owner ${item.ticket.owner} was not verified.`);
      }
      await driver.setTicketStatus(ticketId, item.ticket.status);
      if (await driver.verifyTicketStatus(ticketId, item.ticket.status) !== true) {
        throw new Error(`Ticket #${ticketId} was not verified as ${item.ticket.status}.`);
      }
      result.status = 'working_verified';
      for (const entry of item.timeEntries) {
        const entryResult = { recordId: entry.recordId || null, date: entry.date,
          start: entry.start, end: entry.end, status: 'pending' };
        result.entries.push(entryResult);
        const existing = await driver.findTimeEntries(ticketId, entry);
        if (!Array.isArray(existing)) throw new Error('Existing time entries were not verified.');
        if (existing.length > 1) throw new Error('Multiple matching time entries; stop for reconciliation.');
        if (existing.length === 1) {
          entryResult.status = 'existing_verified';
          entryResult.timeId = existing[0].timeId || null;
          continue;
        }
        if (await driver.openNewTimeEntry(ticketId) !== true) throw new Error('A blank time form was not verified.');
        await driver.fillTimeEntry(ticketId, entry);
        if (await driver.verifyTimeDraft(ticketId, entry) !== true) {
          throw new Error(`Time draft ${entry.recordId || `${entry.date} ${entry.start}`} did not match the work record.`);
        }
        await driver.saveTimeEntry(ticketId, entry);
        const saved = await driver.verifyTimeEntry(ticketId, entry);
        if (!saved || saved.verified !== true) {
          throw new Error(`Saved time entry ${entry.recordId || `${entry.date} ${entry.start}`} was not verified.`);
        }
        entryResult.status = 'saved_verified';
        entryResult.timeId = saved.timeId || null;
      }
      await driver.setTicketStatus(ticketId, item.completedStatus);
      if (await driver.verifyTicketStatus(ticketId, item.completedStatus) !== true) {
        throw new Error(`Ticket #${ticketId} was not verified as ${item.completedStatus}.`);
      }
      result.status = 'completed_verified';
    } catch (error) {
      if (!result.ticketId && Number.isSafeInteger(error.ticketId)) result.ticketId = error.ticketId;
      result.status = 'stopped';
      result.error = error.message;
      return { ok: false, results, stoppedAt: result.recordId || result.summary };
    }
  }
  return { ok: true, results };
}
