import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEodExtras } from '../extension/eod-extras.mjs';
import { renderReport } from '../extension/workflow.mjs';
test('inventory uses merged bottom rows in one table with safe purchase links',()=>{
 const report={date:'2026-10-20',subject:'Daily update',tickets:[{ticketId:123,summary:'Support',status:'Completed',notes:'Done',nextStep:''}],inventory:[{item:'Loaners <stock>',count:'4 M1, 5 M5'}],purchases:[{item:'Adapter & cable',quantity:2,url:'https://example.com/item?a=1&b=2'}]};
 const html=renderReport(report);
 assert.equal((html.match(/<table /g)||[]).length,1);
 assert.ok(html.indexOf('>Inventory</th>')<html.indexOf('</tbody></table>'));
 assert.ok(html.includes('<th colspan="2"'));
 assert.ok(html.includes('<td colspan="2"'));
 assert.ok(html.includes('<td colspan="4"'));

 assert.match(html,/Loaners &lt;stock&gt;/);assert.match(html,/4 x M1, 5 x M5/);
 assert.ok(html.includes('<a href="https://example.com/item?a=1&amp;b=2">Adapter &amp; cable × 2</a>'));
 assert.equal(renderEodExtras({}), '');
});
test('purchase links reject unsafe protocols and incomplete rows',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,bad','not a url'])assert.throws(()=>renderEodExtras({purchases:[{item:'Adapter',quantity:1,url}]}));
 for(const quantity of [0,-1,1.5,''])assert.throws(()=>renderEodExtras({purchases:[{item:'Adapter',quantity,url:'https://example.com'}]}));
});
