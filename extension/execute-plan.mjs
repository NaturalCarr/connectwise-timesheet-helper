import { normalizeTicketTitle } from './ticket-title.mjs';
// Browser drivers implement these operations against visible ConnectWise controls.
// This module owns sequencing and never treats a click as proof of a save.
export async function executePlan(plan, driver, options = {}) {
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
  for (const [ticketIndex, item] of plan.tickets.entries()) {
    if(!options.previous?.results?.[ticketIndex]?.ticketId)item.ticket=normalizeTicketTitle(item.ticket);
    const result = { recordId: item.recordId || null, summary: item.ticket.summary,
      ticketId: null, status: 'pending', entries: [] };
    results.push(result);
    const previous = options.previous?.results?.[ticketIndex];
    const checkpoint = async () => { if(options.onCheckpoint) await options.onCheckpoint({ok:false,results:structuredClone(results)}); };
    const finished = previous && ['completed_verified','status_changed_verified'].includes(previous.status)
      && Number.isSafeInteger(previous.ticketId) && previous.ticketId>0
      && (!item.existingTicketId || item.existingTicketId===previous.ticketId)
      && previous.ticketStatus===item.completedStatus
      && previous.entries?.length===item.timeEntries.length
      && item.timeEntries.every((entry,index)=>{
        const saved=previous.entries[index];
        return ['saved_verified','existing_verified'].includes(saved?.status) && saved.date===entry.date && saved.start===entry.start && saved.end===entry.end
          && (!saved.sourceSignature || saved.sourceSignature===JSON.stringify(entry));
      });
    if(finished){Object.assign(result,structuredClone(previous),{resumeSkipped:true});await checkpoint();if(options.onProgress)await options.onProgress({ticketIndex,action:'skip-confirmed-ticket',state:'finished'});continue;}
    let entryIndex = null;
    const call = async (method,...args) => {
      result.step=method; result.entryIndex=entryIndex;
      if(options.onProgress) await options.onProgress({ticketIndex,entryIndex,action:method,state:'running'});
      await checkpoint();
      const value=await driver[method](...args);
      if(method==='createTicket' && Number.isSafeInteger(value)) result.ticketId=value;
      if(method==='openTicket' && value===true) result.ticketId=args[0];
      await checkpoint();
      if(options.onProgress) await options.onProgress({ticketIndex,entryIndex,action:method,state:'finished'});
      return value;
    };
    try {
      let ticketId;
      let openedByNumber = false;
      if (item.existingTicketId) {
        ticketId = item.existingTicketId;
        try {
          openedByNumber = await call('openTicket', ticketId, item.ticket, { numberOnly: true }) === true;
          if (!openedByNumber) throw new Error(`Ticket #${ticketId} was not found by number.`);
        } catch (error) {
          if (!item.ticket.titleContains || !/not found by number/i.test(error.message)) throw error;
          const matches = await call('findTickets', item.ticket);
          if (!Array.isArray(matches) || matches.length > 1) throw new Error('Ticket number was not found, and title lookup was ambiguous or unverified.');
          ticketId = matches.length ? matches[0].ticketId : await call('createTicket', item.ticket);
        }
      } else {
        const matches = await call('findTickets', item.ticket);
        if (!Array.isArray(matches)) throw new Error('Ticket search was not verified.');
        if (matches.length > 1) throw new Error('Multiple matching tickets; choose one before continuing.');
        ticketId = matches.length === 1 ? matches[0].ticketId : await call('createTicket', item.ticket);
      }
      if (!Number.isSafeInteger(ticketId) || ticketId <= 0) throw new Error('A saved ticket ID was not verified.');
      result.ticketId = ticketId;
      const opened = openedByNumber || await call('openTicket', ticketId, item.ticket, { numberOnly: Boolean(item.existingTicketId || item.ticket.titleContains) });
      if (opened !== true) throw new Error(`Ticket #${ticketId} identity was not verified.`);
      if (driver.readTicketSummary) result.summary = await call('readTicketSummary', ticketId) || result.summary;
      if (previous && ['completed_verified','status_changed_verified'].includes(previous.status)) {
        if(await call('verifyTicketStatus',ticketId,item.completedStatus)!==true) throw new Error('Previously verified ticket status changed; reconcile before resuming.');
        for(const entry of item.timeEntries) {
          const found=await call('findTimeEntries',ticketId,entry);
          if(!Array.isArray(found)||found.length!==1) throw new Error('Previously verified time is missing or ambiguous; no replacement was saved.');
          result.entries.push({date:entry.date,start:entry.start,end:entry.end,status:'existing_verified',timeId:found[0].timeId||null,billable:found[0].billable||null});
        }
        result.status=previous.status;result.ticketStatus=item.completedStatus;await checkpoint();continue;
      }
      if (await call('ensureTicketOwner', ticketId, item.ticket.owner) !== true) {
        throw new Error(`Ticket #${ticketId} Owner ${item.ticket.owner} was not verified.`);
      }
      await call('setTicketStatus', ticketId, item.ticket.status);
      if (await call('verifyTicketStatus', ticketId, item.ticket.status) !== true) {
        throw new Error(`Ticket #${ticketId} was not verified as ${item.ticket.status}.`);
      }
      result.status = 'working_verified';
      for (const [currentEntryIndex, entry] of item.timeEntries.entries()) {
        entryIndex=currentEntryIndex;
        const entryResult = { recordId: entry.recordId || null, date: entry.date,
          start: entry.start, end: entry.end, sourceSignature:JSON.stringify(entry), status: 'pending' };
        result.entries.push(entryResult);
        const existing = await call('findTimeEntries', ticketId, entry);
        if (!Array.isArray(existing)) throw new Error('Existing time entries were not verified.');
        if (existing.length > 1) throw new Error('Multiple matching time entries; stop for reconciliation.');
        if (existing.length === 1) {
          entryResult.status = 'existing_verified';
          entryResult.timeId = existing[0].timeId || null;
          entryResult.billable = existing[0].billable || null;
          await checkpoint();
          continue;
        }
        if (['saved_verified','existing_verified'].includes(previous?.entries?.[entryIndex]?.status)) throw new Error('A previously verified time row is missing. No replacement was saved.');
        if (await call('openNewTimeEntry', ticketId) !== true) throw new Error('A blank time form was not verified.');
        await call('fillTimeEntry', ticketId, entry);
        if (await call('verifyTimeDraft', ticketId, entry) !== true) {
          throw new Error(`Time draft ${entry.recordId || `${entry.date} ${entry.start}`} did not match the work record.`);
        }
        entryResult.status='save_attempted'; await checkpoint();
        await call('saveTimeEntry', ticketId, entry);
        const saved = await call('verifyTimeEntry', ticketId, entry);
        if (!saved || saved.verified !== true) {
          throw new Error(`Saved time entry ${entry.recordId || `${entry.date} ${entry.start}`} was not verified.`);
        }
        entryResult.status = 'saved_verified';
        entryResult.timeId = saved.timeId || null;
        entryResult.billable = saved.billable || null;
        await checkpoint();
      }
      await call('setTicketStatus', ticketId, item.completedStatus);
      if (await call('verifyTicketStatus', ticketId, item.completedStatus) !== true) {
        throw new Error(`Ticket #${ticketId} was not verified as ${item.completedStatus}.`);
      }
      result.status = item.completedStatus === 'Completed' ? 'completed_verified' : 'status_changed_verified';
      result.ticketStatus = item.completedStatus;
      await checkpoint();
    } catch (error) {
      if (!result.ticketId && Number.isSafeInteger(error.ticketId)) result.ticketId = error.ticketId;
      result.status = 'stopped';
      result.error = error.message;
      await checkpoint();
      return { ok: false, results, stoppedAt: result.recordId || result.summary };
    }
  }
  return { ok: true, results };
}

