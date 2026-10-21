import { workReportNotes } from './payroll-report.mjs';
import { normalizeEodExtras } from './eod-extras.mjs';
const clean = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const cleanBlock = (value) => typeof value === 'string' ? value.trim() : '';
import { eodStatuses } from './eod-model.mjs';

function minutes(value, field) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`${field} must use 24-hour HH:mm format.`);
  }
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function planTimeEntry(entry, workingStatus = 'Working Issue Now') {
  if (!entry || typeof entry !== 'object') throw new Error('Time entry must be an object.');
  const date = clean(entry.date);
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }
  const start = minutes(entry.start, 'Start');
  const end = minutes(entry.end, 'End');
  if (end <= start) throw new Error('End must be after start on the same date.');
  const notes = cleanBlock(entry.notes);
  const workType = clean(entry.workType);
  const workRole = clean(entry.workRole);
  const billable = clean(entry.billable).toUpperCase();
  if (!notes) throw new Error('Time entry notes are required.');
  if (!workType) throw new Error('Work type is required.');
  if (!workRole) throw new Error('Work role is required.');
  if (!['B', 'NB', 'NC', 'AUTO'].includes(billable)) throw new Error('Billable must be B, NB, NC, or AUTO (ConnectWise Work Type default).');
  const addNoteTo = clean(entry.addNoteTo) || 'Discussion';
  if (!['Discussion', 'Internal', 'Resolution'].includes(addNoteTo)) {
    throw new Error('Add notes to must be Discussion, Internal, or Resolution.');
  }
  const requestedStatus = clean(entry.ticketStatus);
  if (requestedStatus && requestedStatus.toLowerCase() !== clean(workingStatus).toLowerCase()) {
    throw new Error(`Time entry Ticket Status must be ${workingStatus}; complete the ticket after all time is saved.`);
  }
  const actualHours = Number(((end - start) / 60).toFixed(2));
  return {
    date, start: entry.start, end: entry.end, actualHours,
    notes, workType, workRole, billable,
    location: clean(entry.location),
    businessUnit: clean(entry.businessUnit),
    agreement: clean(entry.agreement),
    ticketStatus: clean(workingStatus),
    addNoteTo,
    sendEmail: false
  };
}

function resolveSchoolSite(school, requestedSite, settings) {
  if (school && !/^[A-Z0-9]{2,16}$/.test(school)) {
    throw new Error(`School acronym must be 2-16 letters or digits: ${school || '(empty)'}.`);
  }
  const site = clean(settings.site);
  if (!site) throw new Error('The company-wide ConnectWise Site is missing from ticket settings.');
  const requested = clean(requestedSite);
  if (requested && requested.toLowerCase() !== site.toLowerCase()) {
    throw new Error(`Site must be ${site} for this company.`);
  }
  return site;
}

export function planWorkItem(item, settings) {
  if (!item || typeof item !== 'object') throw new Error('Work item must be an object.');
  if (!settings || typeof settings !== 'object') throw new Error('Ticket settings are required.');
  const school = clean(item.school).toUpperCase();
  const issue = clean(item.issue);
  const site = resolveSchoolSite(school, item.site, settings);
  if (!issue && !item.existingTicketId && !clean(item.titleContains)) throw new Error('Issue is required when no ticket number or title text is supplied.');

  const existingTicketId = item.existingTicketId ?? null;
  if (existingTicketId !== null && (!Number.isSafeInteger(existingTicketId) || existingTicketId <= 0)) {
    throw new Error('Existing ticket ID must be a positive integer.');
  }

  const titleContains = clean(item.titleContains);
  if (item.titleContains !== undefined && (!titleContains || /[*?]/.test(titleContains))) throw new Error('titleContains must be nonempty literal text without search wildcards.');
  const baseSummary = issue ? (school ? `${school} - ${issue}` : issue) : titleContains || `Ticket #${existingTicketId}`;
  const summary = titleContains && !baseSummary.toLowerCase().includes(titleContains.toLowerCase())
    ? `${baseSummary} - ${titleContains}` : baseSummary;
  const ticket = {
    company: clean(settings.company),
    contact: clean(settings.contact),
    board: clean(settings.board),
    status: clean(settings.status),
    type: clean(settings.type),
    subtype: clean(settings.subtype),
    owner: clean(settings.owner),
    priority: clean(settings.priority),
    agreement: clean(settings.agreement),
    source: clean(settings.source),
    site,
    summary,
    description: cleanBlock(item.description) || summary,
    ...(titleContains ? { titleContains } : {})
  };
  for (const [key, value] of Object.entries(ticket)) {
    if (!value) throw new Error(`Ticket ${key} is required.`);
  }
  const completedStatus = clean(settings.completedStatus);
  if (!completedStatus || completedStatus.toLowerCase() === ticket.status.toLowerCase()) {
    throw new Error('A distinct completedStatus is required in ticket settings.');
  }

  return {
    action: existingTicketId === null ? 'find-or-create-ticket' : 'use-existing-ticket',
    existingTicketId,
    ticket,
    completedStatus,
    timeEntry: item.timeEntry == null ? null : planTimeEntry(item.timeEntry, ticket.status),
    requiresTimeEntryDetails: item.timeEntry == null
  };
}

export function planTicket(input, settings) {
  if (input?.timeEntries !== undefined) {
    if (input.timeEntry !== undefined) throw new Error('Choose timeEntry or timeEntries, not both.');
    if (!Array.isArray(input.timeEntries) || !input.timeEntries.length) throw new Error('timeEntries must contain at least one entry.');
    const { timeEntries, ...base } = input;
    const plans = timeEntries.map((timeEntry) => planTicket({ ...base, timeEntry }, settings));
    const entries = plans.map((plan) => plan.timeEntry);
    for (let i = 0; i < entries.length; i++) for (let j = 0; j < i; j++) {
      if (entries[i].date === entries[j].date && entries[i].start < entries[j].end && entries[j].start < entries[i].end) throw new Error('Ticket time entries overlap.');
      if (entries[i].recordId && entries[i].recordId === entries[j].recordId) throw new Error('Duplicate time recordId.');
    }
    return { ...plans[0], timeEntries: entries };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Ticket input must be an object.');
  }
  const allowed = new Set(['schemaVersion', 'exampleOnly', 'recordId', 'school', 'issue',
    'description', 'site', 'existingTicketId', 'titleContains', 'timeEntry', 'completeAfterTime', 'finalStatus']);
  const unexpected = Object.keys(input).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new Error(`Ticket-only JSON has unsupported fields: ${unexpected.join(', ')}.`);
  if (input.schemaVersion !== undefined && input.schemaVersion !== '1.0') {
    throw new Error('Ticket schemaVersion must be 1.0.');
  }
  if (input.exampleOnly !== undefined && typeof input.exampleOnly !== 'boolean') {
    throw new Error('exampleOnly must be a boolean.');
  }
  for (const field of ['school', 'issue', 'description', 'site']) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      throw new Error(`${field} must be a string.`);
    }
  }
  const recordId = clean(input.recordId);
  if (input.recordId !== undefined && !recordId) throw new Error('recordId must be a nonempty string.');
  if (input.completeAfterTime !== undefined && typeof input.completeAfterTime !== 'boolean') {
    throw new Error('completeAfterTime must be a boolean.');
  }
  if (input.completeAfterTime === true && input.timeEntry === undefined) {
    throw new Error('A timeEntry is required to complete the ticket in this flow.');
  }
  const planned = planWorkItem(input, settings);
  const rawTime = input.timeEntry;
  if (rawTime !== undefined) {
    if (!rawTime || typeof rawTime !== 'object' || Array.isArray(rawTime)) {
      throw new Error('timeEntry must be an object.');
    }
    const timeFields = new Set(['recordId', 'date', 'start', 'end', 'notes', 'workType',
      'workRole', 'billable', 'location', 'businessUnit', 'agreement', 'ticketStatus', 'addNoteTo']);
    const unknownTime = Object.keys(rawTime).filter((key) => !timeFields.has(key));
    if (unknownTime.length) throw new Error(`timeEntry has unsupported fields: ${unknownTime.join(', ')}.`);
    for (const field of ['location', 'businessUnit', 'agreement', 'ticketStatus', 'addNoteTo']) {
      if (rawTime[field] !== undefined && typeof rawTime[field] !== 'string') {
        throw new Error(`timeEntry ${field} must be a string.`);
      }
    }
  }
  const timeEntry = rawTime === undefined ? null : planTimeEntry(rawTime, planned.ticket.status);
  const timeRecordId = rawTime === undefined ? null : clean(rawTime.recordId);
  if (rawTime?.recordId !== undefined && !timeRecordId) {
    throw new Error('timeEntry recordId must be a nonempty string.');
  }
  if (recordId && timeRecordId === recordId) throw new Error('Ticket and time recordIds must differ.');
  if (input.finalStatus !== undefined && !eodStatuses.includes(input.finalStatus)) throw new Error('Unsupported finalStatus.');
  if (input.finalStatus && !timeEntry) throw new Error('finalStatus requires a time entry.');
  const completeAfterTime = Boolean(timeEntry) && (input.finalStatus ? input.finalStatus !== planned.ticket.status : input.completeAfterTime !== false);
  const finalStatus = input.finalStatus || planned.completedStatus;
  return {
    schemaVersion: '1.0', exampleOnly: input.exampleOnly === true,
    recordId: recordId || null, action: planned.action,
    existingTicketId: planned.existingTicketId, ticket: planned.ticket,
    timeEntry: timeEntry ? { ...timeEntry, recordId: timeRecordId || null } : null,
    completeAfterTime, completedStatus: finalStatus,
    steps: [
      { action: planned.action },
      { action: 'set-ticket-owner-and-verify', owner: planned.ticket.owner },
      { action: 'set-ticket-working-and-verify', status: planned.ticket.status },
      ...(timeEntry ? [{ action: 'check-and-save-time-entry' }] : []),
      ...(completeAfterTime ? [{ action: 'set-ticket-completed-and-verify', status: finalStatus }] : [])
    ]
  };
}

export function planWeek(input, settings) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Week input must be an object.');
  }
  if (input.schemaVersion !== undefined && input.schemaVersion !== '1.1') {
    throw new Error('schemaVersion must be 1.1.');
  }
  if (input.exampleOnly !== undefined && typeof input.exampleOnly !== 'boolean') {
    throw new Error('exampleOnly must be a boolean.');
  }
  if (input.timeZone !== undefined && input.timeZone !== 'America/New_York') {
    throw new Error('timeZone must be America/New_York.');
  }
  const weekStart = clean(input.weekStart);
  const monday = new Date(`${weekStart}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || Number.isNaN(monday.getTime())
    || monday.toISOString().slice(0, 10) !== weekStart || monday.getUTCDay() !== 1) {
    throw new Error('weekStart must be a valid Monday in YYYY-MM-DD format.');
  }
  if (!Array.isArray(input.items) || !input.items.length) {
    throw new Error('A week requires at least one work item.');
  }
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const weekEnd = sunday.toISOString().slice(0, 10);
  const seenTickets = new Set();
  const seenTicketIds = new Set();
  const seenEntries = new Set();
  const seenRecordIds = new Set();
  const byDay = new Map();
  const recordIds = (ids, field) => {
    if (ids === undefined) return [];
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !id.trim())
      || new Set(ids).size !== ids.length) {
      throw new Error(`${field} must be a list of unique nonempty strings.`);
    }
    return ids;
  };
  const tickets = input.items.map((item, itemIndex) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Item ${itemIndex + 1} must be an object.`);
    }
    if (item.timeEntry !== undefined) {
      throw new Error(`Item ${itemIndex + 1}: use timeEntries for a week.`);
    }
    if (!Array.isArray(item.timeEntries) || !item.timeEntries.length) {
      throw new Error(`Item ${itemIndex + 1} requires at least one time entry.`);
    }
    const base = planWorkItem(item, settings);
    const issueRecordId = clean(item.recordId);
    if (item.recordId !== undefined && !issueRecordId) throw new Error(`Item ${itemIndex + 1} recordId must be a nonempty string.`);
    if (issueRecordId && seenRecordIds.has(issueRecordId)) throw new Error(`Duplicate recordId: ${issueRecordId}.`);
    if (issueRecordId) seenRecordIds.add(issueRecordId);
    const key = `${base.ticket.company.toLowerCase()}|${base.ticket.site.toLowerCase()}|${base.ticket.summary.toLowerCase()}`;
    if (seenTickets.has(key)) {
      throw new Error(`The same ticket appears twice in the week: ${base.ticket.summary}. Put its entries together.`);
    }
    seenTickets.add(key);
    if (base.existingTicketId !== null) {
      if (seenTicketIds.has(base.existingTicketId)) {
        throw new Error(`Existing ticket #${base.existingTicketId} appears under more than one issue.`);
      }
      seenTicketIds.add(base.existingTicketId);
    }
    const sourceRecordIds = recordIds(item.sourceRecordIds, `Item ${itemIndex + 1} sourceRecordIds`);
    const timeEntries = item.timeEntries.map((raw, entryIndex) => {
      const entry = planTimeEntry(raw, base.ticket.status);
      const entryRecordId = clean(raw.recordId);
      if (raw.recordId !== undefined && !entryRecordId) throw new Error(`Item ${itemIndex + 1}, entry ${entryIndex + 1} recordId must be a nonempty string.`);
      if (entryRecordId && seenRecordIds.has(entryRecordId)) throw new Error(`Duplicate recordId: ${entryRecordId}.`);
      if (entryRecordId) seenRecordIds.add(entryRecordId);
      if (entry.date < weekStart || entry.date > weekEnd) {
        throw new Error(`Item ${itemIndex + 1}, entry ${entryIndex + 1}: date is outside ${weekStart} to ${weekEnd}.`);
      }
      const identity = `${key}|${entry.date}|${entry.start}|${entry.end}|${entry.notes}`;
      if (seenEntries.has(identity)) {
        throw new Error(`Item ${itemIndex + 1}, entry ${entryIndex + 1}: duplicate time entry in the weekly plan.`);
      }
      seenEntries.add(identity);
      const day = byDay.get(entry.date) || [];
      const start = minutes(entry.start, 'Start');
      const end = minutes(entry.end, 'End');
      if (day.some((prior) => start < prior.end && end > prior.start)) {
        throw new Error(`Item ${itemIndex + 1}, entry ${entryIndex + 1}: time overlaps another entry on ${entry.date}.`);
      }
      day.push({ start, end });
      byDay.set(entry.date, day);
      return { ...entry, recordId: entryRecordId || null,
        workFacts: Array.isArray(raw.workFacts) ? raw.workFacts.map(cleanBlock) : [],
        outcome: cleanBlock(raw.outcome), followUp: cleanBlock(raw.followUp),
        sourceRecordIds: recordIds(raw.sourceRecordIds,
          `Item ${itemIndex + 1}, entry ${entryIndex + 1} sourceRecordIds`) };
    });
    const { timeEntry: _unused, ...ticket } = base;
    if (item.finalStatus !== undefined && !eodStatuses.includes(item.finalStatus)) throw new Error(`Item ${itemIndex + 1}: unsupported finalStatus.`);
    return { ...ticket, completedStatus: item.finalStatus || ticket.completedStatus, recordId: issueRecordId || null, context: item.context || null,
      sourceRecordIds, timeEntries, requiresTimeEntryDetails: false };
  });
  const steps = tickets.flatMap((ticket, ticketIndex) => [
    { action: ticket.action, ticketIndex },
    { action: 'set-ticket-owner-and-verify', ticketIndex, owner: ticket.ticket.owner },
    { action: 'set-ticket-working-and-verify', ticketIndex, status: ticket.ticket.status },
    ...ticket.timeEntries.map((_, entryIndex) => ({ action: 'check-and-save-time-entry', ticketIndex, entryIndex })),
    { action: 'set-ticket-completed-and-verify', ticketIndex, status: ticket.completedStatus }
  ]);
  return { schemaVersion: input.schemaVersion || '1.1', exampleOnly: input.exampleOnly === true,
    timeZone: input.timeZone || 'America/New_York', weekStart, weekEnd, tickets, steps,
    endOfDays: normalizeReportDays(input.endOfDays, weekStart, weekEnd),
    totalEntries: tickets.reduce((sum, ticket) => sum + ticket.timeEntries.length, 0) };
}

export function planDay(input, settings) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Daily input must be an object.');
  const date = clean(input.date);
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Daily date must use YYYY-MM-DD.');
  if (input.schemaVersion !== undefined && input.schemaVersion !== '1.2') throw new Error('Daily schemaVersion must be 1.2.');
  if (!Array.isArray(input.items) || !input.items.length) throw new Error('A daily run requires at least one ticket.');
  for (const item of input.items) {
    if (!Array.isArray(item?.timeEntries) || !item.timeEntries.length || item.timeEntries.some((entry) => entry.date !== date)) throw new Error('Every daily time entry must have the daily date.');
  }
  const monday = new Date(parsed); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const plan = planWeek({ ...input, schemaVersion: '1.1', weekStart: monday.toISOString().slice(0,10) }, settings);
  const subject = clean(input.endOfDay?.subject) || `End of day update - ${date}`;
  return { ...plan, mode: 'daily', schemaVersion: '1.2', date, endOfDay: { subject, ...normalizeEodExtras(input.endOfDay),
    tickets: input.items.map((item, index) => ({ status: plan.tickets[index].completedStatus,
      notes: workReportNotes(item,cleanBlock(item.endOfDayNotes)),
      nextStep: cleanBlock(item.nextStep) || item.timeEntries.map((entry) => cleanBlock(entry.followUp)).filter(Boolean).join('\n') })) } };
}


function normalizeReportDays(value, start, end) {
 if(value === undefined) return [];
 if(!Array.isArray(value)) throw new Error('endOfDays must be an array.');
 const seen=new Set();return value.map(day=>{
  if(!day || !/^\d{4}-\d{2}-\d{2}$/.test(day.date || '') || day.date<start || day.date>end || Number.isNaN(Date.parse(day.date)) || new Date(day.date).toISOString().slice(0,10)!==day.date) throw new Error('EoD date must be a valid date inside the week.');
  if(seen.has(day.date)) throw new Error('Duplicate EoD date.');seen.add(day.date);
  return {date:day.date,subject:clean(day.subject),...normalizeEodExtras(day)};
 });
}
