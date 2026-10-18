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
    textContent: 'Example Public Schools',
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
        if (params.type === 'mouseReleased') input.value = 'Example Public Schools';
      }
    }
  };
  const window = { innerWidth: 500, innerHeight: 500 };
  window.top = window;
  const result = await runInNewContext(
    `${source}\n(async () => { const point = await locateCompanySuggestion('Example Public Schools'); await browserMouse(7, point, false); return point; })()`,
    { chrome, document, window, setTimeout(callback) { callback(); } }
  );
  assert.equal(pickerOpen, true);
  assert.equal(input.value, 'Example Public Schools');
  assert.equal(result.x, 62);
  assert.equal(result.y, 44);
  assert.deepEqual(calls, ['attach', 'mouseMoved', 'mousePressed', 'mouseReleased', 'detach']);
});
