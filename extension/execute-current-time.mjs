// Records one time entry on the ticket already visible in ConnectWise.
export async function executeCurrentTime(entry, completeAfterTime, driver, finalStatus = 'Completed') {
  const result = { ok: false, ticketId: null, entry: {
    date: entry.date, start: entry.start, end: entry.end, status: 'pending'
  }, status: 'stopped', step: 'identify-current-ticket' };
  try {
    const current = await driver.identifyCurrentTicket();
    if (!Number.isSafeInteger(current.ticketId) || current.ticketId <= 0) {
      throw new Error('A saved ticket number was not identified.');
    }
    result.ticketId = current.ticketId;
    result.step = 'verify-company-site';
    await driver.verifyCompanySite(current.ticketId);
    result.step = 'check-duplicate-time';
    const existing = await driver.findTimeEntries(current.ticketId, entry);
    if (!Array.isArray(existing)) throw new Error('The duplicate time check was not verified.');
    if (existing.length > 1) throw new Error('Multiple matching Time rows need reconciliation.');
    if (existing.length === 1) {
      result.entry.status = 'existing_verified';
      if (completeAfterTime) {
        result.step = 'set-completed-status';
        await driver.setTicketStatus(current.ticketId, finalStatus);
        result.step = 'verify-completed-status';
        if (await driver.verifyTicketStatus(current.ticketId, finalStatus) !== true) {
          throw new Error('Existing time was verified, but Completed status was not verified.');
        }
        return { ...result, ok: true, status: finalStatus === 'Completed' ? 'completed_verified' : 'status_changed_verified', step: 'done',
          ticketStatus: finalStatus };
      }
      return { ...result, ok: true, status: 'existing_verified', step: 'done' };
    }
    result.step = 'set-working-status';
    await driver.setTicketStatus(current.ticketId, 'Working Issue Now');
    result.step = 'verify-working-status';
    if (await driver.verifyTicketStatus(current.ticketId, 'Working Issue Now') !== true) {
      throw new Error('Working Issue Now was not verified before time entry.');
    }
    result.step = 'open-new-time-entry';
    await driver.openNewTimeEntry(current.ticketId);
    result.step = 'prepare-time-draft';
    const prepared = await driver.prepareTimeDraft(current.ticketId, entry);
    result.step = 'verify-time-draft';
    if (await driver.verifyTimeDraft(current.ticketId, prepared.frameId, entry) !== true) {
      throw new Error('The prepared time form did not match the work record.');
    }
    result.step = 'save-time-entry';
    await driver.saveTimeEntry(current.ticketId, prepared.frameId, entry);
    result.step = 'verify-saved-time';
    const saved = await driver.verifyTimeEntry(current.ticketId, entry);
    if (saved?.verified !== true) throw new Error('The saved Time row was not verified.');
    result.entry.status = 'saved_verified';
    if (completeAfterTime) {
      result.step = 'set-completed-status';
      await driver.setTicketStatus(current.ticketId, finalStatus);
      result.step = 'verify-completed-status';
      if (await driver.verifyTicketStatus(current.ticketId, finalStatus) !== true) {
        throw new Error('Time was saved, but Completed status was not verified.');
      }
    }
    return { ...result, ok: true, status: completeAfterTime ? (finalStatus === 'Completed' ? 'completed_verified' : 'status_changed_verified') : 'time_saved_verified', step: 'done',
      ticketStatus: completeAfterTime ? finalStatus : 'Working Issue Now' };
  } catch (error) {
    return { ...result, error: error.message };
  }
}

