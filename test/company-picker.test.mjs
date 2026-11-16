import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');

test('Company picker can select the exact company when search text is cleared', async () => {
  let pickerOpen = false;
  const input = {
    value: '', readOnly: true,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
    nextElementSibling: { tagName: 'DIV',
      getBoundingClientRect: () => ({ width: 20, height: 20 }),
      click: () => { pickerOpen = true; } }
  };
  const suggestion = {
    textContent: 'Democracy Prep Public Schools',
    getBoundingClientRect: () => ({ left: 12, top: 34, width: 100, height: 20 }),
    click: () => { throw new Error('DOM click does not select this GWT option.'); }
  };
  const document = { querySelectorAll(selector) {
    if (selector === 'input.cw_company') return [input];
    if (selector === '.gwt-dropdown-options > .mm_label') return pickerOpen ? [suggestion] : [];
    return [];
  } };
  const calls = [];
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    debugger: {
      async attach() { calls.push('attach'); },
      async detach() { calls.push('detach'); },
      async sendCommand(_target, _method, params) {
        calls.push(params.type);
        if (params.type === 'mouseReleased') input.value = 'Democracy Prep Public Schools';
      }
    }
  };
  const window = { innerWidth: 500, innerHeight: 500 };
  window.top = window;
  const result = await runInNewContext(
    `${source}\n(async () => { const point = await locateCompanySuggestion('Democracy Prep Public Schools'); await browserMouse(7, point, false); return point; })()`,
    { chrome, document, window, setTimeout(callback) { callback(); } }
  );
  assert.equal(pickerOpen, true);
  assert.equal(input.value, 'Democracy Prep Public Schools');
  assert.equal(result.x, 62);
  assert.equal(result.y, 44);
  assert.deepEqual(calls, ['attach', 'mouseMoved', 'mousePressed', 'mouseReleased', 'detach']);
});

async function companyStage(readyAfter){let reads=0,clicks=0;const ctx={chrome:{runtime:{onMessage:{addListener(){}}}},setTimeout:fn=>fn(),type:async()=>{},guard:async(...args)=>{clicks++;assert.deepEqual(Array.from(args),[7,0,null,'new-ticket-option','Company','input.cw_company']);},read:async({func})=>func.name==='locateCompanySuggestion'?[{result:{found:true,x:0,y:0}}]:[{result:{verified:++reads>readyAfter,mismatches:['Company and Contact blank']}}]};return{promise:runInNewContext(source+';trustedTicketText=type;trustedTicketControlClick=guard;executeConnectWiseScript=read;ensureNewTicketCompany(7,0,{company:"Company"});',ctx),get reads(){return reads},get clicks(){return clicks}};}
test('creation Company uses guarded target click and waits for dependent fields beyond 15 seconds',async()=>{const r=await companyStage(80);await r.promise;assert.equal(r.clicks,1);assert.equal(r.reads,84);assert.match(source,/await ensureNewTicketCompany\(tabId, newFrame, ticket\)/);});
test('unpopulated Company stops without a second selection, New, or Save',async()=>{const r=await companyStage(999);await assert.rejects(r.promise,/No Save was attempted/);assert.equal(r.clicks,1);assert.equal(r.reads,240);});
