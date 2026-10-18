import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');

test('New Ticket board option is selected with browser mouse input and stays selected', async () => {
  let open = false;
  const calls = [];
  const input = {
    value: '$Example HelpDesk (MS)',
    getBoundingClientRect: () => ({ width: 180, height: 20 }),
    nextElementSibling: { tagName: 'DIV',
      getBoundingClientRect: () => ({ width: 15, height: 20 }),
      click: () => { open = true; } }
  };
  const option = {
    textContent: '$Example Implementation (MS)',
    getBoundingClientRect: () => ({ left: 20, top: 40, width: 180, height: 20 }),
    click: () => { throw new Error('Synthetic click must not be used for this option.'); }
  };
  const document = { querySelectorAll(selector) {
    if (selector === 'input.cw_serviceBoard') return [input];
    if (selector === '.gwt-dropdown-options > .mm_label') return open ? [option] : [];
    return [];
  } };
  const window = { innerWidth: 500, innerHeight: 500 };
  window.top = window;
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    tabs: { async update(tabId, options) {
      assert.equal(tabId, 7);
      assert.equal(options.active, true);
    } },
    scripting: { async executeScript({ func, args = [] }) { return [{ result: await func(...args) }]; } },
    debugger: {
      async attach() { calls.push('attach'); },
      async detach() { calls.push('detach'); },
      async sendCommand(_target, _method, params) {
        if (_method === 'DOM.getNodeForLocation') return {backendNodeId:1};
        if (_method === 'DOM.resolveNode') return {object:{objectId:'option'}};
        if (_method === 'Runtime.callFunctionOn') return {result:{value:{verified:true}}};
        if (_method === 'Runtime.releaseObject') return {};
        calls.push(params.type);
        if (params.type === 'mouseReleased') input.value = '$Example Implementation (MS)';
      }
    }
  };
  const result = await runInNewContext(
    `${source}\nreloadConnectWiseSafely=async tabId=>chrome.tabs.reload(tabId);\nchooseTicketOptionInTab(7, 0, 'input.cw_serviceBoard', 'Example Implementation (MS)')`,
    { chrome, document, window, setTimeout(callback) { callback(); } }
  );
  assert.equal(result.selected, '$Example Implementation (MS)');
  assert.deepEqual(calls, ['attach', 'mouseMoved', 'mousePressed', 'mouseReleased', 'detach']);
});

test('saved ticket Status selects Completed rather than the other status input', async () => {
  let open = false;
  const visible = () => ({ left: 12, top: 20, width: 160, height: 20 });
  const ticketStatus = {
    value: 'Working Issue Now', getBoundingClientRect: visible,
    closest: () => ({ innerText: 'Status: Working Issue Now' }),
    nextElementSibling: { tagName: 'DIV', getBoundingClientRect: visible,
      click: () => { open = true; } }
  };
  const slaStatus = { value: 'SLA Not Set', getBoundingClientRect: visible,
    closest: () => ({ innerText: 'SLA Status: SLA Not Set' }) };
  const option = { textContent: 'Completed~',
    getBoundingClientRect: () => ({ left: 180, top: 100, width: 150, height: 20 }),
    click: () => { throw new Error('Synthetic option click must not be used.'); } };
  const document = { querySelectorAll(selector) {
    if (selector === 'input.cw_status') return [ticketStatus, slaStatus];
    if (selector === '.gwt-dropdown-options > .mm_label') return open ? [option] : [];
    return [];
  } };
  const window = { innerWidth: 500, innerHeight: 300 };
  window.top = window;
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    tabs: { async update() {} },
    scripting: { async executeScript({ func, args = [] }) { return [{ result: await func(...args) }]; } },
    debugger: {
      async attach() {}, async detach() {},
      async sendCommand(_target, _method, params) {
        if (_method === 'DOM.getNodeForLocation') return {backendNodeId:1};
        if (_method === 'DOM.resolveNode') return {object:{objectId:'option'}};
        if (_method === 'Runtime.callFunctionOn') return {result:{value:{verified:true}}};
        if (_method === 'Runtime.releaseObject') return {};
        if (params.type === 'mouseReleased') { ticketStatus.value = 'Completed~'; open = false; }
      }
    }
  };
  const result = await runInNewContext(
    `${source}\nreloadConnectWiseSafely=async tabId=>chrome.tabs.reload(tabId);\nchooseTicketOptionInTab(7, 0, 'ticket-status', 'Completed')`,
    { chrome, document, window, setTimeout(callback) { callback(); } }
  );
  assert.equal(result.selected, 'Completed~');
  assert.equal(ticketStatus.value, 'Completed~');
  assert.equal(slaStatus.value, 'SLA Not Set');
});

test('saved ticket Status searches when the open picker only shows the current value', async () => {
  let open = false;
  let searched = false;
  const calls = [];
  const visible = () => ({ left: 12, top: 20, width: 160, height: 20 });
  const ticketStatus = {
    value: 'Working Issue Now', readOnly: false, disabled: false,
    getBoundingClientRect: visible,
    closest: () => ({ innerText: 'Status: Working Issue Now' }),
    focus() { document.activeElement = this; },
    select() {},
    nextElementSibling: { tagName: 'DIV', getBoundingClientRect: visible,
      click() { open = true; } }
  };
  const slaStatus = { value: 'SLA Not Set', getBoundingClientRect: visible,
    closest: () => ({ innerText: 'SLA Status: SLA Not Set' }) };
  const working = { textContent: 'Working Issue Now', getBoundingClientRect: visible };
  const completed = { textContent: 'Completed~',
    getBoundingClientRect: () => ({ left: 180, top: 100, width: 150, height: 20 }),
    click() { throw new Error('Synthetic option click must not be used.'); } };
  const document = { activeElement: null, querySelectorAll(selector) {
    if (selector === 'input.cw_status') return [ticketStatus, slaStatus];
    if (selector === '.gwt-dropdown-options > .mm_label') {
      return open ? [searched ? completed : working] : [];
    }
    return [];
  } };
  const window = { innerWidth: 500, innerHeight: 300 };
  window.top = window;
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    tabs: { async update() {} },
    scripting: { async executeScript({ func, args = [] }) { return [{ result: await func(...args) }]; } },
    debugger: {
      async attach() {}, async detach() {},
      async sendCommand(_target, method, params) {
        if (method === 'DOM.getNodeForLocation') return {backendNodeId:1};
        if (method === 'DOM.resolveNode') return {object:{objectId:'option'}};
        if (method === 'Runtime.callFunctionOn') return {result:{value:{verified:true}}};
        if (method === 'Runtime.releaseObject') return {};
        calls.push(method === 'Input.insertText' ? 'insertText' : params.type);
        if (method === 'Input.insertText') {
          assert.equal(document.activeElement, ticketStatus);
          searched = true;
          ticketStatus.value = params.text;
        }
        if (params.type === 'mouseReleased') { ticketStatus.value = 'Completed~'; open = false; }
      }
    }
  };
  const result = await runInNewContext(
    `${source}\nreloadConnectWiseSafely=async tabId=>chrome.tabs.reload(tabId);\nchooseTicketOptionInTab(7, 0, 'ticket-status', 'Completed')`,
    { chrome, document, window, setTimeout(callback) { callback(); } }
  );
  assert.equal(result.selected, 'Completed~');
  assert.deepEqual(calls, ['insertText', 'mouseMoved', 'mousePressed', 'mouseReleased']);
  assert.equal(slaStatus.value, 'SLA Not Set');
});

test('ticket Save rejects a covered click point before sending a mouse press', async () => {
  const calls = [];
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    tabs: { async update() { calls.push('activate'); } },
    scripting: { async executeScript({ func, args }) {
      assert.equal(func.name, 'locateTicketSaveButton');
      assert.equal(args[0], '8000001');
      return [{ result: { x: 80, y: 25 } }];
    } },
    debugger: {
      async attach() { calls.push('attach'); },
      async detach() { calls.push('detach'); },
      async sendCommand(_target, method, params) {
        if (method === 'DOM.getNodeForLocation') return { backendNodeId: 9 };
        if (method === 'DOM.resolveNode') return { object: { objectId: 'nav' } };
        if (method === 'Runtime.callFunctionOn') return { result: { value: {
          verified: false, reason: 'another control covers the click point'
        } } };
        if (method === 'Input.dispatchMouseEvent') calls.push(params.type);
      }
    }
  };
  await assert.rejects(runInNewContext(`${source}\nreloadConnectWiseSafely=async tabId=>chrome.tabs.reload(tabId);\ntrustedTicketControlClick(7, 3, 8000001, 'save')`,
    { chrome, setTimeout(callback) { callback(); } }), /No click was sent/);
  assert.deepEqual(calls, ['activate', 'attach', 'detach']);
});

test('ticket Save click point includes its nested frame offset', async () => {
  const button = { scrollIntoView() {},
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 20, height: 20 }) };
  const document = { body: { innerText: 'Service Ticket #8000001 - SCHD - Repeat Jams' },
    querySelectorAll(selector) {
      return selector === '.cw_ToolbarButton_Save' ? [button] : [];
    } };
  const top = { innerWidth: 800, innerHeight: 600 };
  top.top = top;
  const window = { top, parent: top, frameElement: {
    clientLeft: 0, clientTop: 0,
    getBoundingClientRect: () => ({ left: 100, top: 50 })
  } };
  const point = await runInNewContext(`${source}\nreloadConnectWiseSafely=async tabId=>chrome.tabs.reload(tabId);\nlocateTicketSaveButton(8000001)`,
    { chrome: { runtime: { onMessage: { addListener() {} } } }, document, window });
  assert.equal(point.x, 120);
  assert.equal(point.y, 80);
});

test('an unsaved Completed selection still receives Save and reload verification', async () => {
  const calls = [];
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    scripting: { async executeScript({ func }) {
      assert.equal(func.name, 'verifyTicketStatus');
      return [{ result: { verified: true } }];
    } },
    tabs: { async reload() { calls.push('reload'); } }
  };
  const result = await runInNewContext(`${source}\nreloadConnectWiseSafely=async tabId=>chrome.tabs.reload(tabId);
    matchingFrame = async () => ({ frameId: 3, state: { status: 'Completed' } });
    trustedTicketSave = async () => { calls.push('save'); };
    chooseTicketOptionInTab = async () => { calls.push('commit'); };
    setTicketStatusInTab({ tabId: 7, ticketId: 8000001, status: 'Completed' })`,
    { chrome, calls, setTimeout(callback) { callback(); } }
  );
  assert.equal(result.saved, true);
  assert.deepEqual(calls, ['commit', 'save', 'reload']);
});

test('typed Completed is not accepted while its picker remains open', () => {
  const visible = () => ({ width: 160, height: 20 });
  const input = { value: 'Completed', getBoundingClientRect: visible,
    closest: () => ({ innerText: 'Status: Completed' }) };
  const option = { textContent: 'Completed~', getBoundingClientRect: visible };
  const document = { querySelectorAll(selector) {
    return selector === 'input.cw_status' ? [input]
      : selector === '.gwt-dropdown-options > .mm_label' ? [option] : [];
  } };
  const result = runInNewContext(`${source}\nreloadConnectWiseSafely=async tabId=>chrome.tabs.reload(tabId);\ninspectSelectedTicketOption('ticket-status', 'Completed')`,
    { chrome: { runtime: { onMessage: { addListener() {} } } }, document });
  assert.equal(result.verified, false);
  assert.equal(result.pickerOpen, true);
});


test('new ticket status retries a reverted unsaved selection once', async () => {
  const result = await runInNewContext(`${source}\nreloadConnectWiseSafely=async tabId=>chrome.tabs.reload(tabId);
    let clicks=0;
    trustedTicketControlClick = async () => { clicks++; };
    executeConnectWiseScript = async ({func}) => [{result:func.name === 'locateTicketOption'
      ? {found:true,x:10,y:10}
      : {verified:clicks===2,count:1,pickerOpen:false,displayed:clicks===2?'Working Issue Now':'Pre-Process'}}];
    chooseTicketOptionInTab(7,4,'ticket-status','Working Issue Now').then(result=>({result,clicks}));`,
    {chrome:{runtime:{onMessage:{addListener(){}}},tabs:{async update(){}}},setTimeout(fn){fn();}});
  assert.equal(result.clicks,2);
  assert.equal(result.result.selected,'Working Issue Now');
});




