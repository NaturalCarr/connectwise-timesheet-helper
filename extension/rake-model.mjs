import { eodStatuses } from './eod-model.mjs';
export const rakeDirection = 'IIQ_TO_CW';
export const isClosedCwStatus = value => /^(pending\s+closure|completed|closed)(?:\b|\/)/i.test(String(value || '').trim());
export function collectOpenRakeReferences(rows, limit = null) {
 const candidates = rows.filter(row => Number.isSafeInteger(row.ticketId) && row.ticketId > 0 && !isClosedCwStatus(row.status)).sort((a,b)=>b.ticketId-a.ticketId);
 const selected = limit === null ? candidates : candidates.slice(0,limit);
 const refs = new Map(), skipped = [];
 for (const row of selected) {
  const numbers = iiqReferences(row.summary);
  if (numbers.length !== 1) { skipped.push({...row, reason:numbers.length?'Multiple IIQ references in the title':'No IIQ reference in the title'}); continue; }
  const record=refs.get(numbers[0]) || {reference:numbers[0],cwTicketIds:[]};
  if(!record.cwTicketIds.includes(row.ticketId))record.cwTicketIds.push(row.ticketId);
  refs.set(numbers[0],record);
 }
 return {tickets:[...refs.values()],skipped,totalOpen:candidates.length,selectedOpen:selected.length};
}
const normalize = value => String(value || '').trim().replace(/~$/, '').replace(/\s+/g, ' ').toLowerCase();
export function iiqReferences(text) {
 return [...new Set([...String(text || '').matchAll(/\bT\s*-\s*(\d+)\b/gi)].map(match => `T-${match[1]}`))];
}
export function mapIiqStatus(status) {
 const exact = eodStatuses.find(value => normalize(value) === normalize(status));
 if (exact) return { status: exact, reason: 'Exact status match' };
 const aliases = {
  'resolved': ['Completed', 'IIQ Resolved maps to CW Completed'],
  'in progress': ['Working Issue Now', 'IIQ In Progress maps to CW Working Issue Now'],
  'waiting on requestor': ['Waiting Client Response', 'Waiting for the requestor/client'],
  'waiting on requester': ['Waiting Client Response', 'Waiting for the requestor/client'],
  'waiting on vendor': ['Waiting on 3rd Party', 'Vendor follow-up'],
  'waiting on copier vendor': ['Waiting on 3rd Party', 'Copier-vendor follow-up'],
  'waiting on cabling vendor': ['Waiting on 3rd Party', 'Cabling-vendor follow-up']
 };
 const alias = aliases[normalize(status)];
 return alias ? { status: alias[0], reason: alias[1] } : { status: null, reason: 'Choose a CW status: no confirmed mapping' };
}
export function collectRakeReferences(runs, { mode = 'all', limit = 25 } = {}) {
 if (!['all', 'recent'].includes(mode)) throw new Error('Choose all or recent handled tickets.');
 if (mode === 'recent' && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('Recent ticket count must be a positive integer.');
 const refs = new Map();
 for (const run of runs || []) {
  const results = run.evidence?.results || run.result?.results || [];
  for (const [index, result] of results.entries()) {
   if (!Number.isSafeInteger(result.ticketId) || result.ticketId <= 0) continue;
   const item = run.plan?.tickets?.[index];
   const references = iiqReferences([result.summary, item?.ticket?.summary, item?.ticket?.titleContains].filter(Boolean).join(' '));
   if (references.length !== 1) continue;
   const reference = references[0];
   const row = refs.get(reference) || { reference, cwTicketIds: [], lastHandledAt: '', runIds: [] };
   if (!row.cwTicketIds.includes(result.ticketId)) row.cwTicketIds.push(result.ticketId);
   if (run.id && !row.runIds.includes(run.id)) row.runIds.push(run.id);
   row.lastHandledAt = [row.lastHandledAt, run.updatedAt || ''].sort().at(-1);
   refs.set(reference, row);
  }
 }
 const rows = [...refs.values()].sort((a, b) => b.lastHandledAt.localeCompare(a.lastHandledAt) || a.reference.localeCompare(b.reference));
 return mode === 'recent' ? rows.slice(0, limit) : rows;
}
export function validateRakeInput(input) {
 if (input?.schemaVersion !== '1.0' || input.direction !== rakeDirection || !Array.isArray(input.tickets)) throw new Error('Rake JSON requires schemaVersion 1.0, direction IIQ_TO_CW, and tickets.');
 if (input.exampleOnly !== undefined && typeof input.exampleOnly !== 'boolean') throw new Error('exampleOnly must be a boolean.');
 const allowed = new Set(['schemaVersion','direction','exampleOnly','tickets','resourcesFilter']);
 if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('Unsupported rake input field.');
 if (input.resourcesFilter !== undefined && (typeof input.resourcesFilter !== 'string' || !input.resourcesFilter.trim() || input.resourcesFilter.length > 100)) throw new Error('A nonempty Resources filter is required.');
 const seen = new Set();
 const tickets = input.tickets.map(row => {
  const refs = iiqReferences(row.reference);
  if (refs.length !== 1 || refs[0] !== row.reference || seen.has(row.reference)) throw new Error('Each IIQ reference must be unique and use T-12345 format.');
  seen.add(row.reference);
  const ids = row.cwTicketIds || [];
  if (!Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) throw new Error('CW IDs must be unique positive integers.');
  return { reference: row.reference, cwTicketIds: [...ids], lastHandledAt: row.lastHandledAt || '' };
 });
 return { schemaVersion: '1.0', direction: rakeDirection, exampleOnly: input.exampleOnly === true, ...(input.resourcesFilter?{resourcesFilter:input.resourcesFilter.trim()}:{}), tickets };
}
export async function previewRake(input, driver, onProgress = () => {}, cancelled = () => false) {
 const plan = validateRakeInput(input);
 if (plan.exampleOnly) throw new Error('Example rake records cannot be scanned against live tickets.');
 const rows = [];
 for (const ticket of plan.tickets) {
  if (cancelled()) break;
  const row = { ...ticket, state: 'checking', selected: false };
  rows.push(row);
  await onProgress(rows);
  try {
   if (ticket.cwTicketIds.length > 1) throw new Error('Multiple CW tickets recorded for this IIQ reference. Review before updating.');
   const recorded = ticket.cwTicketIds.length === 1;
   const ids = recorded ? ticket.cwTicketIds : await driver.resolveCw(ticket.reference);
   row.matchMethod = recorded ? 'recorded-id' : 'reference-search';
   if (!Array.isArray(ids) || ids.length !== 1) throw new Error('Exactly one CW ticket must match this IIQ reference.');
   row.ticketId = ids[0];
   if (plan.resourcesFilter) {
    const eligibility=await driver.checkEligible(row.ticketId,plan.resourcesFilter);
    if(!eligibility.eligible){row.state='skipped';row.reason=eligibility.reason;await onProgress(rows);continue;}
   }
   const current = await driver.readCw(row.ticketId);
   if (current.ticketId !== row.ticketId || iiqReferences(current.summary).length !== 1 || !iiqReferences(current.summary).includes(ticket.reference) || !current.status) throw new Error('CW reference/status was not verified.');
   Object.assign(row,{summary:current.summary,cwStatus:current.status});
   if(isClosedCwStatus(current.status)){row.state='skipped';row.reason='CW ticket is pending closure, completed or closed';await onProgress(rows);continue;}
   const source = await driver.readIiq(ticket.reference);
   if (source.reference !== ticket.reference || !source.status) throw new Error('IIQ identity/status was not verified.');
   Object.assign(row, { iiqStatus: source.status, iiqUrl: source.url, observedAt: source.observedAt });
   const mapping = mapIiqStatus(source.status);
   Object.assign(row, { summary: current.summary, cwStatus: current.status, targetStatus: mapping.status, reason: mapping.reason });
   row.state = mapping.status ? (normalize(current.status) === normalize(mapping.status) ? 'unchanged' : 'change') : 'review';
   row.selected = row.state === 'change';
  } catch (error) { row.state = 'blocked'; row.error = error.message; }
  await onProgress(rows);
 }
 const byId = new Map();
 for (const row of rows.filter(row => row.ticketId)) { const group = byId.get(row.ticketId) || []; group.push(row); byId.set(row.ticketId, group); }
 for (const group of byId.values()) if (group.length > 1) for (const row of group) Object.assign(row, { state: 'blocked', selected: false, error: 'CW ticket is linked to multiple IIQ references in this scan.' });
 await onProgress(rows);
 return { schemaVersion: '1.0', direction: rakeDirection, scannedAt: new Date().toISOString(), openOnly:true, ...(plan.resourcesFilter?{resourcesFilter:plan.resourcesFilter}:{}), rows, cancelled: cancelled() };
}
export async function applyRake(preview, driver, onProgress = () => {}, cancelled = () => false) {
 if (preview?.direction !== rakeDirection || preview.openOnly !== true || !Array.isArray(preview.rows)) throw new Error('A preview from IIQ to CW is required.');
 const results = []; const seen = new Set();
 for (const row of preview.rows.filter(row => row.selected)) {
  if (row.state !== 'change' && row.state !== 'review') throw new Error('Only reviewed change rows can be applied.');
  if (!eodStatuses.includes(row.targetStatus) || !Number.isSafeInteger(row.ticketId) || row.ticketId <= 0 || seen.has(row.ticketId)) throw new Error('Invalid or duplicate CW target.');
  seen.add(row.ticketId);
 }
 for (const row of preview.rows.filter(row => row.selected)) {
  if (cancelled()) break;
  const result = { reference: row.reference, ticketId: row.ticketId, targetStatus: row.targetStatus, state: 'pending' };
  results.push(result);
  try {
   if(preview.resourcesFilter){const eligibility=await driver.checkEligible(row.ticketId,preview.resourcesFilter);if(!eligibility.eligible){result.state='skipped';result.reason=eligibility.reason;await onProgress(results);continue;}}
   const source = await driver.readIiq(row.reference);
   if (source.reference !== row.reference || new URL(source.url).origin !== new URL(row.iiqUrl).origin || normalize(source.status) !== normalize(row.iiqStatus)) throw new Error('IIQ status changed since preview. Scan again.');
   if (row.matchMethod !== 'recorded-id') {
    const ids = await driver.resolveCw(row.reference);
    if (!Array.isArray(ids) || ids.length !== 1 || ids[0] !== row.ticketId) throw new Error('CW matching changed since preview. Scan again.');
   }
   const current = await driver.readCw(row.ticketId);
   if (current.ticketId !== row.ticketId || iiqReferences(current.summary).length !== 1 || !iiqReferences(current.summary).includes(row.reference)) throw new Error('CW identity/reference changed.');
   if (isClosedCwStatus(current.status)){result.state='skipped';result.reason='CW ticket is pending closure, completed or closed';await onProgress(results);continue;}
   if (normalize(current.status) === normalize(row.targetStatus)) result.state = 'already_matched';
   else {
    if (normalize(current.status) !== normalize(row.cwStatus)) throw new Error('CW status changed since preview. Scan again.');
    const saved = await driver.setCwStatus(row.ticketId, row.targetStatus);
    if (!saved?.saved || normalize(saved.status) !== normalize(row.targetStatus)) throw new Error('CW save was not verified.');
    result.state = 'saved_verified';
   }
  } catch (error) { result.state = 'stopped'; result.error = error.message; await onProgress(results); return { ok: false, direction: rakeDirection, results, stoppedAt: row.reference }; }
  await onProgress(results);
 }
 return { ok: !cancelled(), direction: rakeDirection, results, cancelled: cancelled() };
}
