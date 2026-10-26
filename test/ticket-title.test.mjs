import test from 'node:test';import assert from 'node:assert/strict';import {normalizeTicketTitle} from '../extension/ticket-title.mjs';
test('long titles shorten before duplicate lookup and preserve full text and imported reference',()=>{
 const full='School - '+ 'Detailed issue '.repeat(15)+' - T-12345';const ticket={summary:full,description:'Actual work.',titleContains:'T-12345'};const result=normalizeTicketTitle(ticket);assert.ok(result.summary.length<=100);assert.ok(result.summary.endsWith('T-12345'));assert.ok(result.description.includes(full));assert.equal(ticket.summary,full);assert.deepEqual(normalizeTicketTitle(result),result);
});
test('short titles remain unchanged',()=>{const ticket={summary:'School - DITL',description:'Work'};assert.equal(normalizeTicketTitle(ticket),ticket);});
