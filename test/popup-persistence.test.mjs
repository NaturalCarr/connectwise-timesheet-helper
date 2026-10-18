import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/popup-persistence.js', import.meta.url), 'utf8');

function popup(storage) {
  const handlers = new Map();
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      id, type: id.includes('complete') || id === 'ticket-with-time' ? 'checkbox' : 'text',
      value: '', checked: false, files: [],
      handlers: new Map(),
      addEventListener(type, handler) { this.handlers.set(type, handler); },
      dispatchEvent(event) { this.handlers.get(event.type)?.(event); }
    });
    return elements.get(id);
  };
  const document = {
    getElementById: element,
    addEventListener(type, handler) {
      const list = handlers.get(type) || [];
      list.push(handler);
      handlers.set(type, list);
    },
    async fire(type, target) {
      return Promise.all((handlers.get(type) || []).map((handler) => handler({ type, target })));
    },
    dispatchEvent(event) { void this.fire(event.type); }
  };
  for (const id of ['ticket-form', 'draft-form']) {
    element(id).reset = () => {
      for (const input of elements.values()) {
        if (input.id.endsWith('-form')) continue;
        input.value = '';
        input.checked = false;
      }
    };
  }
  const chrome = { storage: { local: {
    async get(keys) { return Object.fromEntries(keys.map((key) => [key, storage[key]])); },
    async set(values) { Object.assign(storage, values); },
    async remove(keys) { for (const key of keys) delete storage[key]; }
  } } };
  const window = {};
  runInNewContext(source, { chrome, document, window, Event });
  return { document, element, window };
}

test('popup restores typed ticket and time details and clears only on explicit Clear', async () => {
  const storage = {};
  const first = popup(storage);
  first.element('ticket-issue').value = 'Copier jams repeating';
  first.element('notes').value = 'Actual work note';
  await first.document.fire('input', first.element('ticket-issue'));
  await first.document.fire('input', first.element('notes'));
  await first.window.popupDraft.save('ticket');
  await first.window.popupDraft.save('time');

  const reopened = popup(storage);
  await reopened.document.fire('DOMContentLoaded');
  assert.equal(reopened.element('ticket-issue').value, 'Copier jams repeating');
  assert.equal(reopened.element('notes').value, 'Actual work note');

  reopened.element('clear-saved-inputs').dispatchEvent(new Event('click'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(storage['popupDraft:ticket'], undefined);
  assert.equal(storage['popupDraft:time'], undefined);
  assert.equal(reopened.element('ticket-issue').value, '');
});
