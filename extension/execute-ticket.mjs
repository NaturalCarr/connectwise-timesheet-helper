// One daily ticket may include one time entry; every save is checked before continuing.
export async function executeTicket(plan, driver) {
  if (!plan?.ticket || plan.exampleOnly) throw new Error('A validated, non-example ticket plan is required.');
  if (plan.completeAfterTime && (!plan.timeEntry || !plan.completedStatus)) {
    throw new Error('Completion requires a time entry and completed ticket status.');
  }
  const required = ['findTickets', 'createTicket', 'openTicket', 'ensureTicketOwner',
    'setTicketStatus', 'verifyTicketStatus'];
  if (plan.timeEntry) required.push('findTimeEntries', 'openNewTimeEntry', 'fillTimeEntry',
    'verifyTimeDraft', 'saveTimeEntry', 'verifyTimeEntry');
  for (const method of required) {
    if (typeof driver?.[method] !== 'function') throw new Error(`Browser driver lacks ${method}.`);
  }
  const result = { ok: false, recordId: plan.recordId || null, summary: plan.ticket.summary,
    ticketId: null, status: 'pending' };
  try {
    let ticketId = plan.existingTicketId;
    let created = false;
    if (!ticketId) {
      const matches = await driver.findTickets(plan.ticket);
      if (!Array.isArray(matches)) throw new Error('Ticket search was not verified.');
      if (matches.length > 1) throw new Error('Multiple matching tickets; choose one before continuing.');
      if (!matches.length && plan.ticket.titleContains) throw new Error('No ticket contains the requested title text. No replacement ticket was created.');
      created = matches.length === 0;
      ticketId = created ? await driver.createTicket(plan.ticket) : matches[0].ticketId;
    }
    if (!Number.isSafeInteger(ticketId) || ticketId <= 0) throw new Error('A saved ticket ID was not verified.');
    result.ticketId = ticketId;
    if (await driver.openTicket(ticketId, plan.ticket, { numberOnly: Boolean(plan.existingTicketId || plan.ticket.titleContains) }) !== true) {
      throw new Error(`Ticket #${ticketId} identity was not verified.`);
    }
    if (await driver.ensureTicketOwner(ticketId, plan.ticket.owner) !== true) {
      throw new Error(`Ticket #${ticketId} Owner ${plan.ticket.owner} was not verified.`);
    }
    await driver.setTicketStatus(ticketId, plan.ticket.status);
    if (await driver.verifyTicketStatus(ticketId, plan.ticket.status) !== true) {
      throw new Error(`Ticket #${ticketId} was not verified as ${plan.ticket.status}.`);
    }
    let finalStatus = plan.ticket.status;
    if (plan.timeEntry) {
      const entry = plan.timeEntry;
      result.entry = { recordId: entry.recordId || null, date: entry.date,
        start: entry.start, end: entry.end, status: 'pending' };
      const existing = await driver.findTimeEntries(ticketId, entry);
      if (!Array.isArray(existing)) throw new Error('Existing time entries were not verified.');
      if (existing.length > 1) throw new Error('Multiple matching time entries; stop for reconciliation.');
      if (existing.length === 1) {
        result.entry.status = 'existing_verified';
        result.entry.timeId = existing[0].timeId || null;
      } else {
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
        result.entry.status = 'saved_verified';
        result.entry.timeId = saved.timeId || null;
      }
      if (plan.completeAfterTime) {
        await driver.setTicketStatus(ticketId, plan.completedStatus);
        if (await driver.verifyTicketStatus(ticketId, plan.completedStatus) !== true) {
          throw new Error(`Ticket #${ticketId} was not verified as ${plan.completedStatus}.`);
        }
        finalStatus = plan.completedStatus;
      }
    }
    return { ...result, ok: true,
      status: plan.completeAfterTime ? (plan.completedStatus === 'Completed' ? 'completed_verified' : 'status_changed_verified')
        : plan.timeEntry ? 'working_with_time_verified'
          : created ? 'created_verified' : 'existing_verified',
      owner: plan.ticket.owner, ticketStatus: finalStatus };
  } catch (error) {
    if (!result.ticketId && Number.isSafeInteger(error.ticketId)) result.ticketId = error.ticketId;
    return { ...result, status: 'stopped', error: error.message };
  }
}


