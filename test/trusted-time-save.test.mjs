import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');

test('Save & Return is activated with one browser-level mouse press and release', async () => {
  const calls = [];
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    tabs: { async update(tabId, options) {
      assert.equal(tabId, 7);
      assert.equal(options.active, true);
      calls.push('activate');
    } },
    scripting: { async executeScript({ func, target }) {
      assert.equal(func.name, 'locateTimeSaveButton');
      assert.equal(target.allFrames, true);
      return [{ frameId: 3, result: { found: false, count: 0, candidates: 0 } },
        { frameId: 0, result: { found: true, x: 120, y: 40 } }];
    } },
    debugger: {
      async attach() { calls.push('attach'); },
      async sendCommand(_target, method, params) {
        assert.equal(method, 'Input.dispatchMouseEvent');
        calls.push(params.type);
      },
      async detach() { calls.push('detach'); }
    }
  };
  await runInNewContext(`${source}\ntrustedTimeSave(7, 3, 8000003)`, { chrome });
  assert.deepEqual(calls, ['activate', 'attach', 'mouseMoved', 'mousePressed', 'mouseReleased', 'detach']);
});

test('Save & Return click position includes its nested frame offset', () => {
  const start = source.indexOf('function locateTimeSaveButton() {');
  const end = source.indexOf('\nasync function trustedTimeSave', start);
  const locateSource = source.slice(start, end);
  const button = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 40, height: 20 }),
    scrollIntoView() {}, querySelectorAll() { return []; } };
  const document = { querySelectorAll(selector) {
    if (selector === '.cw_ToolbarButton_SaveAndReturn') return [button];
    return [];
  } };
  const top = { innerWidth: 800, innerHeight: 600 };
  top.top = top;
  const window = { top, parent: top, frameElement: {
    clientLeft: 0, clientTop: 0,
    getBoundingClientRect: () => ({ left: 100, top: 50 })
  } };
  const point = runInNewContext(`${locateSource}\nlocateTimeSaveButton()`, { document, window });
  assert.equal(point.found, true);
  assert.equal(point.x, 130);
  assert.equal(point.y, 80);
});

test('Save & Return uses the single toolbar action immediately right of Save when its class changes', () => {
  const start = source.indexOf('function locateTimeSaveButton() {');
  const end = source.indexOf('\nasync function trustedTimeSave', start);
  const locateSource = source.slice(start, end);
  const save = { className: 'cw_ToolbarButton_Save',
    getBoundingClientRect: () => ({ left: 20, top: 10, width: 18, height: 18 }) };
  const saveAndReturn = { className: 'new-connectwise-toolbar-class',
    getBoundingClientRect: () => ({ left: 54, top: 10, width: 18, height: 18 }),
    querySelector(selector) { return selector === '.mm_button' ? {} : null; },
    scrollIntoView() {} };
  const refresh = { className: 'cw_ToolbarButton_Refresh',
    getBoundingClientRect: () => ({ left: 88, top: 10, width: 18, height: 18 }),
    querySelector() { return {}; } };
  save.parentElement = { children: [save, saveAndReturn, refresh] };
  const document = { querySelectorAll(selector) {
    return selector === '.cw_ToolbarButton_Save' ? [save] : [];
  } };
  const window = { innerWidth: 300, innerHeight: 100 };
  window.top = window;
  const point = runInNewContext(`${locateSource}\nlocateTimeSaveButton()`, { document, window });
  assert.equal(point.found, true);
  assert.equal(point.method, 'adjacent-to-save');
  assert.equal(point.x, 63);
  assert.equal(point.y, 19);
});
