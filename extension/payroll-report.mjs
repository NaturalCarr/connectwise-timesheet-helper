export const isPayrollWrap = entry => /^\$?payroll wrap$/i.test(String(entry.workType || '').trim());
export const cleanEodNotes = text => String(text || '').split(/\r?\n/).filter(line => !/payroll\s+wrap|^\s*(?:[-*•]\s*)?(?:wrap|lunch)(?:[.!:\s]|$)/i.test(line)).join('\n').trim();
export function workReportNotes(item, preferred) {
 const excluded=new Set(item.timeEntries.filter(isPayrollWrap).flatMap(e=>String(e.notes || '').split(/\r?\n/)).map(s=>s.trim()).filter(Boolean));
 const text=preferred || item.timeEntries.filter(e=>!isPayrollWrap(e)).map(e=>e.notes).join('\n');
 return cleanEodNotes(String(text).split(/\r?\n/).filter(line=>!excluded.has(line.trim())).join('\n'));
}
