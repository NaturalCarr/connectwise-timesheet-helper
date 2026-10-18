import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
const start = source.indexOf('function inspectTicketFrame(ticketId) {');
const end = source.indexOf('\nasync function inspectTicketInTab', start);
const inspectSource = source.slice(start, end);

function input(value, rowText = '') {
  return { value, getBoundingClientRect: () => ({ width: 100, height: 20 }),
    closest: () => ({ innerText: rowText, querySelectorAll: () => [] }) };
}

test('saved ticket identity survives ConnectWise status label variation', () => {
  const controls = {
    'input.cw_status': [input('Working Issue Now', 'Status * Working Issue Now'),
      input('SLA Not Set', 'SLA Status SLA Not Set')],
    'input.cw_PsaSummaryHeader': [input('SCHB - Laptop issue')],
    'input.cw_company': [input('Example Public Schools')],
    'input.cw_companyViewCompanyAddress': [input('Example Public Schools')]
  };
  const document = { body: { innerText: 'Service Ticket #8000003 - SCHB - Laptop issue' },
    querySelectorAll: (selector) => controls[selector] || [] };
  const result = runInNewContext(`${inspectSource}\ninspectTicketFrame('8000003')`, { document });
  assert.equal(result.matches, true);
  assert.equal(result.company, 'Example Public Schools');
  assert.equal(result.site, 'Example Public Schools');
  assert.equal(result.status, 'Working Issue Now');
});

test('saved ticket status can be read when row labels do not identify the input', () => {
  const controls = {
    'input.cw_status': [input('Working Issue Now', 'Ticket fields'),
      input('SLA Not Set', 'SLA fields')],
    'input.cw_PsaSummaryHeader': [input('SCHB - Laptop issue')],
    'input.cw_company': [input('Example Public Schools')],
    'input.cw_companyViewCompanyAddress': [input('Example Public Schools')]
  };
  const document = { body: { innerText: 'Service Ticket #8000003 - SCHB - Laptop issue' },
    querySelectorAll: (selector) => controls[selector] || [] };
  const result = runInNewContext(`${inspectSource}\ninspectTicketFrame('8000003')`, { document });
  assert.equal(result.matches, true);
  assert.equal(result.status, 'Working Issue Now');
});

for (const status of ['Scheduled Onsite~', 'Scheduled Remote~', 'Waiting Parts/Repair', 'Waiting Client Response~', 'Scheduling Required', 'Waiting on 3rd Party', 'Waiting for next onsite visit', 'Pending Closure~', 'Completed~', 'Closed', 'Closed/Client Unresponsive']) {
  test(`imported ticket status ${status} is distinguished from SLA without row labels`, () => {
    const controls = {
      'input.cw_status': [input('SLA Not Set', 'SLA fields'), input(status, 'Ticket fields')],
      'input.cw_PsaSummaryHeader': [input('IIQ- Ticket Number: T-90650')]
    };
    const document = { body: { innerText: 'Service Ticket #8000004 - IIQ- Ticket Number: T-90650' },
      querySelectorAll: (selector) => controls[selector] || [] };
    const result = runInNewContext(`${inspectSource}\ninspectTicketFrame('8000004')`, { document });
    assert.equal(result.matches, true);
    assert.equal(result.status, status);
  });
}
