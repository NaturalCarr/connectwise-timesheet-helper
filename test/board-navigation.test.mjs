import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');

test('ticket search can reach Service Board from Today with New menu open', async () => {
  const state = { board: false, newMenu: true, serviceDeskMenu: false,
    nextBoardReadFails: false, actions: [] };
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    tabs: { async update(tabId, options) {
      assert.equal(tabId, 7);
      assert.equal(options.active, true);
      state.actions.push('activate-tab');
    } },
    scripting: { async executeScript({ func }) {
      const action = func.name;
      state.actions.push(action);
      if (action === 'inspectBoardFrame') {
        if (state.nextBoardReadFails) {
          state.nextBoardReadFails = false;
          throw new Error('Frame was replaced during navigation.');
        }
        return [{ frameId: 0, result: { matches: state.board } }];
      }
      if (action === 'clickBoardBreadcrumb') return [{ frameId: 0, result: { clicked: false } }];
      if (action === 'inspectServiceDeskMenu') {
        return [{ frameId: 0, result: { matches: state.serviceDeskMenu } }];
      }
      if (action === 'locateServiceDeskSection') {
        return [{ frameId: 0, result: { found: true, x: 10, y: 20 } }];
      }
      if (action === 'locateServiceBoardMenuItem') {
        return [{ frameId: 0, result: { found: true, x: 40, y: 50 } }];
      }
      throw new Error(`Unexpected browser action: ${action}`);
    } },
    debugger: {
      async attach() {},
      async detach() {},
      async sendCommand(_target, _method, params) {
        if (params.type === 'mouseMoved' && params.x === 10) {
          if (state.newMenu) state.newMenu = false;
          else state.serviceDeskMenu = true;
        }
        if (params.type === 'mousePressed' && params.x === 40) {
          state.board = true;
          state.nextBoardReadFails = true;
          state.serviceDeskMenu = false;
        }
      }
    }
  };
  const board = await runInNewContext(`${source}\nensureServiceBoard(7)`, {
    chrome, setTimeout(callback) { callback(); }
  });
  assert.equal(board.frameId, 0);
  assert.equal(state.actions[0], 'activate-tab');
  assert.equal(state.actions.filter((action) => action === 'locateServiceDeskSection').length, 2);
  assert.equal(state.actions.filter((action) => action === 'locateServiceBoardMenuItem').length, 1);
});
