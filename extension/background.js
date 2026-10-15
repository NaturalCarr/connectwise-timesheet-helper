if (typeof importScripts === 'function') importScripts('form-functions.js');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === 'helperBuild') {
    sendResponse({ ok: true, version: '0.8.52', ticketSaveMethod: 'exact-element' });
    return false;
  }
  const actions = {
    enterNotes,
    inspectTicket: inspectTicketInTab,
    identifyCurrentTicket: identifyCurrentTicketInTab,
    verifyCurrentTicketCompanySite: verifyCurrentTicketCompanySiteInTab,
    findTickets: findOpenTitleTicketsInTab,
    createTicket: createTicketInTab,
    openTicket: openTicketInTab,
    ensureTicketOwner: ensureTicketOwnerInTab,
    setTicketStatus: setTicketStatusInTab,
    verifyTicketStatus: verifyTicketStatusInTab,
    readTimeRows: readTimeRowsInTab,
    findTimeEntries: findTimeEntriesInTab,
    verifySavedTime: verifySavedTimeInTab,
    openNewTimeEntry: openNewTimeEntryInTab,
    prepareTimeDraft: prepareTimeDraftInTab,
    verifyPreparedTime: verifyPreparedTimeInTab,
    savePreparedTime: savePreparedTimeInTab
  };
  const action = actions[message?.action];
  if (!action) return false;
  action(message).then(sendResponse, (error) => sendResponse({ ok: false,
    error: `[Helper 0.8.52; ${message.action}] ${error.message}`,
    ticketId: Number.isSafeInteger(error.ticketId) ? error.ticketId : null }));
  return true;
});

async function connectwiseTab(tabId) {
  if (!Number.isInteger(tabId)) throw new Error('A ConnectWise tab ID is required.');
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith('https://na.myconnectwise.net/')) throw new Error('The tab is not ConnectWise.');
}

function pauseForeignExtensionFrames(leaseId, ownExtensionId) {
  let state = globalThis.__cwForeignFramePause;
  if (!state) state = globalThis.__cwForeignFramePause = { leases: new Set(), parked: [], observers: new Map() };
  state.leases.add(leaseId);
  const visited = new Set();
  const visit = (doc) => {
    if (visited.has(doc)) return;
    visited.add(doc);
    if (!state.observers.has(doc)) {
      const observer = new MutationObserver(() => {
        visited.clear(); visit(doc);
      });
      observer.observe(doc.documentElement || doc, { childList: true, subtree: true,
        attributes: true, attributeFilter: ['src'] });
      state.observers.set(doc, observer);
    }
    for (const frame of doc.querySelectorAll('iframe, frame')) {
      let url;
      try { url = new URL(frame.getAttribute('src') || '', doc.baseURI); } catch { continue; }
      if (url.protocol === 'chrome-extension:' && url.hostname !== ownExtensionId) {
        if (!frame.parentNode) continue;
        const placeholder = (doc.ownerDocument || doc).createComment('ConnectWise browser input: extension popup temporarily paused');
        frame.parentNode.replaceChild(placeholder, frame);
        state.parked.push({ frame, placeholder });
      } else {
        // Only accessible documents are traversed. Foreign frame contents are never read.
        try { if (frame.contentDocument) visit(frame.contentDocument); } catch { /* Cross-origin pod. */ }
      }
    }
    // Password-manager popups may live in open or closed shadow roots.
    // Only iframe host elements are parked; their contents are never read.
    for (const element of doc.querySelectorAll('*')) {
      let root = element.shadowRoot;
      if (!root && typeof chrome !== 'undefined' && chrome.dom?.openOrClosedShadowRoot) {
        try { root = chrome.dom.openOrClosedShadowRoot(element); } catch { /* Unsupported host. */ }
      }
      if (root) visit(root);
    }
  };
  visit(document);
  return { leaseId, parked: state.parked.length };
}

function resumeForeignExtensionFrames(leaseId) {
  const state = globalThis.__cwForeignFramePause;
  if (!state) return { restored: 0 };
  state.leases.delete(leaseId);
  if (state.leases.size) return { restored: 0 };
  for (const observer of state.observers.values()) observer.disconnect();
  let restored = 0;
  for (const { frame, placeholder } of state.parked) {
    if (placeholder.isConnected) { placeholder.replaceWith(frame); restored++; }
  }
  delete globalThis.__cwForeignFramePause;
  return { restored };
}

function foreignExtensionAccessError(error) {
  return /Cannot access a chrome-extension:\/\/ URL of different extension/i.test(error?.message || '');
}

async function temporarilyPauseForeignExtensionFrames(tabId, allowEmpty = false) {
  await connectwiseTab(tabId);
  const leaseId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [result] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] },
    func: pauseForeignExtensionFrames, args: [leaseId, chrome.runtime.id || ''] });
  if (!result?.result?.leaseId) throw new Error('The ConnectWise extension-popup pause could not be prepared.');
  if (!result.result.parked && !allowEmpty) {
    await restoreForeignExtensionFrames(tabId, leaseId);
    throw new Error('Browser input was blocked by another extension, but no removable extension popup frame was found. No click was sent.');
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  return leaseId;
}

async function restoreForeignExtensionFrames(tabId, leaseId) {
  // If the document navigated away, its parked DOM nodes have already gone away too.
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] },
    func: resumeForeignExtensionFrames, args: [leaseId] }).catch(() => {});
}

async function attachConnectWiseDebugger(target) {
  try { await chrome.debugger.attach(target, '1.3'); return null; }
  catch (error) {
    if (!foreignExtensionAccessError(error)) throw error;
    const leaseId = await temporarilyPauseForeignExtensionFrames(target.tabId);
    try { await chrome.debugger.attach(target, '1.3'); return leaseId; }
    catch (retryError) {
      await restoreForeignExtensionFrames(target.tabId, leaseId);
      throw new Error(`Browser input attach remained blocked after pausing extension popups: ${retryError.message}. No click was sent.`);
    }
  }
}

async function executeConnectWiseScript(options) {
  try { return await chrome.scripting.executeScript(options); }
  catch (error) {
    if (!options.target?.allFrames || !foreignExtensionAccessError(error)) throw error;
    const leaseId = await temporarilyPauseForeignExtensionFrames(options.target.tabId);
    try { return await chrome.scripting.executeScript(options); }
    finally { await restoreForeignExtensionFrames(options.target.tabId, leaseId); }
  }
}

async function matchingFrame(tabId, ticketId, func, ...extraArgs) {
  await connectwiseTab(tabId);
  if (!/^\d+$/.test(String(ticketId))) throw new Error('A numeric ticket ID is required.');
  const frames = await executeConnectWiseScript({
    target: { tabId, allFrames: true }, func, args: [String(ticketId), ...extraArgs]
  });
  const matches = frames.filter((frame) => frame.result?.matches);
  if (matches.length !== 1) {
    const counts = frames.map((frame) => frame.result?.signals).filter(Boolean)
      .map((signals) => `header ${signals.header}, summary ${signals.summary}, company ${signals.company}, site ${signals.site}, status ${signals.status}`);
    throw new Error(`Expected one visible ticket #${ticketId} frame; found ${matches.length}.${counts.length ? ` Frame controls: ${counts.join(' | ')}.` : ''}`);
  }
  return { frameId: matches[0].frameId, state: matches[0].result };
}

function inspectTicketFrame(ticketId) {
  const visible = (el) => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const statuses = [...document.querySelectorAll('input.cw_status')].filter(visible);
  const ticketStatuses = statuses.filter((input) => {
    const row = input.closest('tr');
    const label = row ? [...row.querySelectorAll('td, label, span')]
      .filter(visible).map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim())
      .find((value) => /^Status\s*:?\s*\*?$/i.test(value)) : null;
    return Boolean(label) || /^Status\s*:?\s*\*?/i.test(row?.innerText.trim() || '');
  });
  const knownTicketStatuses = statuses.filter((input) =>
    /^(pre-process|scheduled remote|scheduled onsite|working issue now|scheduling required|waiting parts\/repair|waiting client response|waiting on 3rd party|waiting for next onsite visit|pending closure|completed|closed|closed\/client unresponsive)\s*~?$/i.test(input.value.trim()));
  const selectedStatus = ticketStatuses.length === 1 ? ticketStatuses[0]
    : knownTicketStatuses.length === 1 ? knownTicketStatuses[0]
      : statuses.length === 1 ? statuses[0] : null;
  const summaries = [...document.querySelectorAll('input.cw_PsaSummaryHeader')].filter(visible);
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-\s*([^\n]+)/)?.[0] || '';
  const company = [...document.querySelectorAll('input.cw_company')].filter(visible);
  const site = [...document.querySelectorAll('input.cw_companyViewCompanyAddress')].filter(visible);
  const headerMatches = new RegExp(`Service Ticket #${ticketId}(?!\\d)`).test(header);
  const matches = headerMatches && summaries.length >= 1;
  return { matches, header, summary: summaries.length === 1 ? summaries[0].value : null,
    status: selectedStatus?.value || null,
    company: company.length === 1 ? company[0].value : null,
    site: site.length === 1 ? site[0].value : null,
    signals: { header: headerMatches, summary: summaries.length, company: company.length,
      site: site.length, status: statuses.length, ticketStatus: ticketStatuses.length,
      knownTicketStatus: knownTicketStatuses.length } };
}

async function inspectTicketInTab({ tabId, ticketId }) {
  const found = await matchingFrame(tabId, ticketId, inspectTicketFrame);
  return { ok: true, ticketId: Number(ticketId), ...found.state };
}

function identifyCurrentTicketFrame() {
  const text = document.body?.innerText || '';
  const match = text.match(/Service Ticket #(\d+)\s*-\s*([^\n]+)/);
  const visible = (selector) => [...document.querySelectorAll(selector)].some((el) =>
    el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  const ticketPage = visible('input.cw_PsaSummaryHeader') && visible('input.cw_status');
  const timeList = [...document.querySelectorAll('.cw-ml-header')].some((el) =>
    el.getBoundingClientRect().height > 0 && /Start Time/i.test(el.innerText) && /End Time/i.test(el.innerText));
  return { ticketId: match ? Number(match[1]) : null, summary: match?.[2]?.trim() || null,
    supported: ticketPage || timeList };
}

async function identifyCurrentTicketInTab({ tabId }) {
  await connectwiseTab(tabId);
  const frames = await executeConnectWiseScript({
    target: { tabId, allFrames: true }, func: identifyCurrentTicketFrame
  });
  const matches = frames.filter((frame) => frame.result?.supported && frame.result.ticketId);
  if (matches.length !== 1) {
    throw new Error(`Open a saved ticket's Ticket or Time tab. Found ${matches.length} identifiable ticket views.`);
  }
  return { ok: true, ticketId: matches[0].result.ticketId,
    summary: matches[0].result.summary };
}

async function verifyCurrentTicketCompanySiteInTab({ tabId, ticketId, company, site }) {
  await connectwiseTab(tabId);
  let found;
  try { found = await matchingFrame(tabId, ticketId, inspectTicketFrame); }
  catch {
    const time = await matchingFrame(tabId, ticketId, inspectTimeRows);
    await executeConnectWiseScript({
      target: { tabId, frameIds: [time.frameId] }, func: clickTicketTab, args: [String(ticketId)]
    });
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      try { found = await matchingFrame(tabId, ticketId, inspectTicketFrame); break; }
      catch { /* Wait for Ticket tab. */ }
    }
  }
  if (!found) throw new Error('Ticket detail could not be verified from the Time tab.');
  const actual = found.state;
  if (actual.company !== company || actual.site !== site) {
    throw new Error(`Ticket #${ticketId} Company or Site differs from the configured values.`);
  }
  return { ok: true, verified: true, ticketId: Number(ticketId), summary: actual.summary };
}

function inspectBoardFrame() {
  const visible = (selector) => [...document.querySelectorAll(selector)].some((el) =>
    el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  return { matches: visible('#Summary-input') && visible('#Company_Name-input')
    && visible('#Site_name-input') && visible('.cw-toolbar-search') };
}

function clickBoardBreadcrumb() {
  const matches = [...document.querySelectorAll('*')].filter((el) =>
    el.children.length === 0 && el.textContent.trim() === 'Service Board List'
    && el.getBoundingClientRect().width > 0);
  if (!matches.length) return { clicked: false };
  matches[0].click();
  return { clicked: true };
}

function inspectServiceDeskMenu() {
  const visible = (el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const menus = [...document.querySelectorAll('.popupContent')].filter(visible);
  const items = menus.flatMap((popup) => [...popup.querySelectorAll('div, span, a, [role="menuitem"]')])
    .filter((el) => visible(el) && el.textContent.trim() === 'Service Board'
      && ![...el.children].some((child) => child.textContent.trim() === 'Service Board'));
  return { matches: items.length === 1, popupCount: menus.length, boardItemCount: items.length };
}

function locateServiceDeskSection() {
  const sections = [...document.querySelectorAll('.cw-lcm-section')].filter((section) =>
    section.getBoundingClientRect().width > 0 && section.innerText.trim() === 'Service Desk');
  if (sections.length !== 1) return { found: false, count: sections.length };
  const rect = sections[0].getBoundingClientRect();
  let x = rect.left + rect.width / 2;
  let y = rect.top + rect.height / 2;
  let view = window;
  while (view !== view.top) {
    const frame = view.frameElement;
    if (!frame) throw new Error('Service Desk frame position could not be mapped.');
    const bounds = frame.getBoundingClientRect();
    x += bounds.left + frame.clientLeft;
    y += bounds.top + frame.clientTop;
    view = view.parent;
  }
  if (x < 0 || y < 0 || x >= view.innerWidth || y >= view.innerHeight) {
    throw new Error('Service Desk is outside the visible browser area.');
  }
  return { found: true, x, y };
}

function locateServiceBoardMenuItem() {
  const visible = (el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const menus = [...document.querySelectorAll('.popupContent')].filter(visible);
  const items = menus.flatMap((popup) => [...popup.querySelectorAll('div, span, a, [role="menuitem"]')])
    .filter((el) => visible(el) && el.textContent.trim() === 'Service Board'
      && ![...el.children].some((child) => child.textContent.trim() === 'Service Board'));
  if (items.length !== 1) throw new Error('Service Board menu item was not unique.');
  const rect = items[0].getBoundingClientRect();
  let x = rect.left + rect.width / 2;
  let y = rect.top + rect.height / 2;
  let view = window;
  while (view !== view.top) {
    const frame = view.frameElement;
    if (!frame) throw new Error('Service Board menu frame position could not be mapped.');
    const bounds = frame.getBoundingClientRect();
    x += bounds.left + frame.clientLeft;
    y += bounds.top + frame.clientTop;
    view = view.parent;
  }
  if (x < 0 || y < 0 || x >= view.innerWidth || y >= view.innerHeight) {
    throw new Error('Service Board is outside the visible browser area.');
  }
  return { found: true, x, y };
}

async function browserMouse(tabId, point, hoverOnly) {
  const target = { tabId };
  let attached = false;
  let foreignLease = null;
  try {
    foreignLease = await attachConnectWiseDebugger(target);
    attached = true;
    if (hoverOnly) {
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: 0, y: 0, button: 'none'
      });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: point.x, y: point.y, button: 'none'
      });
    } else {
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: point.x, y: point.y, button: 'none'
      });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1
      });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1
      });
    }
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
    if (foreignLease) await restoreForeignExtensionFrames(target.tabId, foreignLease);
  }
}

async function visibleBoardFrames(tabId) {
  const frames = await executeConnectWiseScript({ target: { tabId, allFrames: true }, func: inspectBoardFrame });
  return frames.filter((frame) => frame.result?.matches);
}

async function waitForBoard(tabId, attempts) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const boards = await visibleBoardFrames(tabId);
      if (boards.length) return boards;
    } catch { /* The ConnectWise frame may be replacing itself during navigation. */ }
  }
  return [];
}

async function ensureServiceBoard(tabId) {
  // Mouse input is delivered to the foreground tab. Activate it before reading
  // coordinates, since ConnectWise may change its layout when the tab becomes active.
  await chrome.tabs.update(tabId, { active: true });
  let boards = await visibleBoardFrames(tabId);
  if (boards.length === 1) return boards[0];
  if (boards.length > 1) throw new Error('More than one Service Board List is visible.');

  const breadcrumbs = await executeConnectWiseScript({
    target: { tabId, allFrames: true }, func: clickBoardBreadcrumb
  });
  if (breadcrumbs.some((frame) => frame.result?.clicked)) {
    boards = await waitForBoard(tabId, 16);
    if (boards.length === 1) return boards[0];
    if (boards.length > 1) throw new Error('More than one Service Board List opened.');
  }

  let lastMenuState = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const menus = await executeConnectWiseScript({
      target: { tabId, allFrames: true }, func: inspectServiceDeskMenu
    });
    const openMenus = menus.filter((frame) => frame.result?.matches);
    lastMenuState = menus.map((frame) => frame.result).filter(Boolean);
    if (openMenus.length > 1) throw new Error('More than one Service Desk menu is visible.');
    if (openMenus.length === 1) {
      const [item] = await executeConnectWiseScript({
        target: { tabId, frameIds: [openMenus[0].frameId] }, func: locateServiceBoardMenuItem
      });
      if (!item.result?.found) throw new Error('Service Board menu item was not located.');
      await browserMouse(tabId, item.result, false);
      boards = await waitForBoard(tabId, 40);
      if (boards.length === 1) return boards[0];
      throw new Error('Service Board was selected, but its ticket search did not appear.');
    }
    const sections = await executeConnectWiseScript({
      target: { tabId, allFrames: true }, func: locateServiceDeskSection
    });
    const found = sections.filter((frame) => frame.result?.found);
    if (found.length !== 1) {
      throw new Error('Service Desk navigation was not uniquely found.');
    }
    await browserMouse(tabId, found[0].result, true);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const popupCount = Math.max(0, ...lastMenuState.map((state) => state.popupCount || 0));
  const boardItemCount = Math.max(0, ...lastMenuState.map((state) => state.boardItemCount || 0));
  throw new Error(`Service Desk menu did not open from this ConnectWise page (visible popup menus: ${popupCount}, Service Board items: ${boardItemCount}).`);
}

function searchBoardForTicket(ticket) {
  const visible = (selector) => [...document.querySelectorAll(selector)].filter((el) =>
    el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  const one = (selector) => {
    const matches = visible(selector);
    if (matches.length !== 1) throw new Error(`${selector}: expected one visible control.`);
    return matches[0];
  };
  one('.cw-toolbar-clear').click();
  const set = (selector, value) => {
    const input = one(selector);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (input.value !== value) throw new Error(`${selector} did not retain the search value.`);
  };
  set('#Summary-input', `*${ticket.titleContains || ticket.summary}*`);
  if (ticket.titleContains) {
    // Imported references search Summary only; remove every other grid filter.
    for (const input of document.querySelectorAll('input[id$="-input"]')) {
      if (input.id !== 'Summary-input' && input.getBoundingClientRect().width > 0
        && input.getBoundingClientRect().height > 0 && input.value) set(`#${input.id}`, '');
    }
    set('#Company_Name-input', '');
    set('#Site_name-input', '');
  } else {
    set('#Company_Name-input', ticket.company);
    set('#Site_name-input', ticket.site);
  }
  one('.cw-toolbar-search').click();
  return { searched: true };
}

function inspectBoardSearch(ticket) {
  const inputs = ['#Summary-input', '#Company_Name-input', '#Site_name-input']
    .map((selector) => document.querySelector(selector)?.value || '');
  if (inputs[0] !== `*${ticket.titleContains || ticket.summary}*` || inputs[1] !== (ticket.titleContains ? '' : ticket.company) || inputs[2] !== (ticket.titleContains ? '' : ticket.site)) {
    return { ready: false, reason: 'Search filters changed.' };
  }
  const count = document.body?.innerText.match(/View\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i);
  const noResults = /No records found|No results found/i.test(document.body?.innerText || '');
  if (!count && !noResults) return { ready: false, reason: 'Search result count is not visible.' };
  const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const rows = [...document.querySelectorAll('tr')].map((row) =>
    [...row.children].filter((cell) => cell.tagName === 'TD').map((cell) => cell.innerText.trim()))
    .filter((cells) => cells.length > 9 && /^\d+$/.test(cells[1] || ''));
  const term = normalize(ticket.titleContains || ticket.summary);
  if (rows.some((cells) => !normalize(cells[6]).includes(term)
    || (!ticket.titleContains && (normalize(cells[8]) !== normalize(ticket.company)
    || normalize(cells[9]) !== normalize(ticket.site))))) {
    return { ready: false, reason: 'Waiting for filtered search results.' };
  }
  if (count && Number(count[2]) < Number(count[3])) {
    return { ready: false, reason: 'Search has additional pages; duplicate check is incomplete.', paginated: true };
  }
  const matches = rows.filter((cells) => (ticket.titleContains ? normalize(cells[6]).includes(normalize(ticket.titleContains)) : normalize(cells[6]) === normalize(ticket.summary))
    && (ticket.titleContains || (normalize(cells[8]) === normalize(ticket.company)
    && normalize(cells[9]) === normalize(ticket.site))))
    .map((cells) => ({ ticketId: Number(cells[1]), summary: cells[6], company: cells[8], site: cells[9] }));
  return { ready: true, matches, visibleRows: rows.length, total: count ? Number(count[3]) : 0 };
}

function inspectSearchedTicket(ticket) {
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-\s*([^\n]+)/);
  const visible = (selector) => [...document.querySelectorAll(selector)]
    .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const summary = visible('input.cw_PsaSummaryHeader')[0]?.value;
  const company = visible('input.cw_company')[0]?.value;
  const site = visible('input.cw_companyViewCompanyAddress')[0]?.value;
  return { matches: Boolean(header && (ticket.titleContains ? normalize(summary).includes(normalize(ticket.titleContains)) : normalize(summary) === normalize(ticket.summary))
    && (ticket.titleContains || (normalize(company) === normalize(ticket.company) && normalize(site) === normalize(ticket.site)))),
    ticketId: header ? Number(header[1]) : null };
}

async function findTicketsInTab({ tabId, ticket }) {
  await connectwiseTab(tabId);
  if (!ticket?.summary || !ticket.company || !ticket.site) throw new Error('Ticket identity is incomplete.');
  const board = await ensureServiceBoard(tabId);
  const target = { tabId, frameIds: [board.frameId] };
  await executeConnectWiseScript({ target, func: searchBoardForTicket, args: [ticket] });
  let emptySince = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const ticketFrames = await executeConnectWiseScript({
      target: { tabId, allFrames: true }, func: inspectSearchedTicket, args: [ticket]
    });
    const opened = ticketFrames.filter((frame) => frame.result?.matches);
    if (opened.length === 1) return { ok: true, matches: [{ ticketId: opened[0].result.ticketId }],
      visibleRows: 1, total: 1 };
    const [result] = await executeConnectWiseScript({ target, func: inspectBoardSearch, args: [ticket] });
    if (result.result?.paginated) throw new Error(result.result.reason);
    if (result.result?.ready) {
      if (result.result.matches.length) return { ok: true, matches: result.result.matches,
        visibleRows: result.result.visibleRows, total: result.result.total };
      if (emptySince === null) emptySince = Date.now();
      if (Date.now() - emptySince >= 3000) return { ok: true, matches: [],
        visibleRows: result.result.visibleRows, total: result.result.total };
    } else emptySince = null;
  }
  throw new Error('Ticket search was not verified. Stop before creating a ticket.');
}

async function findOpenTitleTicketsInTab(message) {
  const result = await findTicketsInTab(message);
  if (!message.ticket?.titleContains) return result;
  const matches = [];
  const closedMatches = [];
  const closed = /^(completed|closed|closed\/client unresponsive)\s*~?$/i;
  for (const candidate of result.matches) {
    await openTicketInTab({ tabId: message.tabId, ticketId: candidate.ticketId, numberOnly: true });
    let actual;
    for (let attempt = 0; attempt < 120; attempt++) {
      actual = await inspectTicketInTab({ tabId: message.tabId, ticketId: candidate.ticketId });
      if (actual.status) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!actual.status) throw new Error('Title match status could not be read. Open-ticket lookup was not verified.');
    const match = { ...candidate, summary: actual.summary, status: actual.status };
    if (!closed.test(actual.status.trim())) matches.push(match);
    else closedMatches.push(match);
  }
  return { ...result, matches: matches.length ? matches : closedMatches };
}

function clickBoardNewTicket() {
  const buttons = [...document.querySelectorAll('.cw-toolbar-new-item.cw-toolbar-new-btn')]
    .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  if (buttons.length !== 1 || !document.querySelector('#Summary-input')) {
    throw new Error('The Service Board New Ticket button was not uniquely found.');
  }
  buttons[0].click();
  return { clicked: true };
}

function inspectNewTicketFrame() {
  const visible = (selector) => [...document.querySelectorAll(selector)].filter((el) =>
    el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  return { matches: visible('input.cw_PsaSummaryHeader').length === 1
    && visible('input.cw_company').length === 1 && /New Ticket/.test(document.body?.innerText || '')
    && !/Service Ticket #\d+/.test(document.body?.innerText || '') };
}

function focusTicketText(selector) {
  const inputs = [...document.querySelectorAll(selector)].filter((el) =>
    el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  if (inputs.length !== 1 || inputs[0].disabled) throw new Error(`${selector} is not a unique editable field.`);
  inputs[0].focus();
  inputs[0].select();
  if (document.activeElement !== inputs[0]) throw new Error(`${selector} did not gain focus.`);
  return { focused: true };
}

function verifyTicketText(selector, value) {
  const inputs = [...document.querySelectorAll(selector)].filter((el) =>
    el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  return { verified: inputs.length === 1 && inputs[0].value === value };
}

async function trustedTicketText(tabId, frameId, selector, value, verifyText = true) {
  const target = { tabId };
  let attached = false;
  let foreignLease = null;
  try {
    foreignLease = await attachConnectWiseDebugger(target);
    attached = true;
    await executeConnectWiseScript({
      target: { tabId, frameIds: [frameId] }, func: focusTicketText, args: [selector]
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    await chrome.debugger.sendCommand(target, 'Input.insertText', { text: value });
    if (verifyText) {
      const [check] = await executeConnectWiseScript({
        target: { tabId, frameIds: [frameId] }, func: verifyTicketText, args: [selector, value]
      });
      if (!check.result?.verified) throw new Error(`${selector} did not retain the entered text.`);
    }
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
    if (foreignLease) await restoreForeignExtensionFrames(target.tabId, foreignLease);
  }
}

async function locateTicketOption(selector, value, searchMode = false) {
  const visible = (el) => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().replace(/^\$\s*/, '').replace(/~$/, '').trim().toLowerCase();
  const optionSelector = ['input.cw_workType', 'input.cw_ticketOwner'].includes(selector) ? '.gwt-dropdown-options .mm_label' : '.gwt-dropdown-options > .mm_label';
  const inputs = [...document.querySelectorAll(selector === 'ticket-status' ? 'input.cw_status' : selector)].filter((input) =>
    visible(input) && (selector !== 'ticket-status'
      || (/^Status\s*:/i.test(input.closest('tr')?.innerText.trim() || '') || /^(pre-process|scheduled remote|scheduled onsite|working issue now|scheduling required|waiting parts\/repair|waiting client response|waiting on 3rd party|waiting for next onsite visit|pending closure|completed|closed|closed\/client unresponsive)\s*~?$/i.test((input.value || '').trim()))));
  if (inputs.length !== 1) throw new Error(`${selector}: expected one visible input, found ${inputs.length}.`);
  const input = inputs[0];
  const openChoice = [...document.querySelectorAll(optionSelector)]
    .some((option) => visible(option) && normalize(option.textContent) === normalize(value));
  if (!searchMode && normalize(input.value) === normalize(value) && !openChoice) return { alreadySelected: true };
  const arrow = input.nextElementSibling?.tagName === 'DIV'
    ? input.nextElementSibling : input.parentElement?.querySelector('input + div');
  if (!visible(arrow)) throw new Error(`${selector}: dropdown arrow was not found.`);
  if (!searchMode && !openChoice) arrow.click();
  let matches = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    matches = [...document.querySelectorAll(optionSelector)]
      .filter((option) => visible(option) && normalize(option.textContent) === normalize(value));
    if (matches.length) break;
    if (searchMode && attempt === 14) arrow.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (matches.length === 0) return { found: false, readOnly: Boolean(input.readOnly),
    displayed: input.value,
    options: [...document.querySelectorAll(optionSelector)]
      .filter(visible).map((option) => option.textContent.trim()).slice(0, 12) };
  if (matches.length !== 1) throw new Error(`${selector}: ${value} matched ${matches.length} visible choices.`);
  if (['input.cw_workType', 'input.cw_ticketOwner'].includes(selector)) {
    matches[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const rect = matches[0].getBoundingClientRect();
  let x = rect.left + rect.width / 2;
  let y = rect.top + rect.height / 2;
  let view = window;
  while (view !== view.top) {
    const frame = view.frameElement;
    if (!frame) throw new Error(`${selector}: dropdown frame position could not be mapped.`);
    const bounds = frame.getBoundingClientRect();
    const scaleX = frame.offsetWidth ? bounds.width / frame.offsetWidth : 1;
    const scaleY = frame.offsetHeight ? bounds.height / frame.offsetHeight : 1;
    x = bounds.left + (x + frame.clientLeft) * scaleX;
    y = bounds.top + (y + frame.clientTop) * scaleY;
    view = view.parent;
  }
  if (x < 0 || y < 0 || x >= view.innerWidth || y >= view.innerHeight) {
    throw new Error(`${selector}: option is outside the visible browser area.`);
  }
  return { found: true, x, y };
}

function focusTicketStatusSearch() {
  const visible = (el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const inputs = [...document.querySelectorAll('input.cw_status')].filter((input) =>
    visible(input) && (/^Status\s*:/i.test(input.closest('tr')?.innerText.trim() || '') || /^(pre-process|scheduled remote|scheduled onsite|working issue now|scheduling required|waiting parts\/repair|waiting client response|waiting on 3rd party|waiting for next onsite visit|pending closure|completed|closed|closed\/client unresponsive)\s*~?$/i.test((input.value || '').trim())));
  if (inputs.length !== 1 || inputs[0].disabled || inputs[0].readOnly) {
    throw new Error('Saved ticket Status is not a unique editable search field.');
  }
  inputs[0].focus();
  inputs[0].select();
  if (document.activeElement !== inputs[0]) throw new Error('Saved ticket Status did not gain focus.');
  return { focused: true };
}

async function typeTicketStatusSearch(tabId, frameId, value) {
  const target = { tabId };
  let attached = false;
  let foreignLease = null;
  try {
    foreignLease = await attachConnectWiseDebugger(target);
    attached = true;
    await executeConnectWiseScript({
      target: { tabId, frameIds: [frameId] }, func: focusTicketStatusSearch
    });
    await chrome.debugger.sendCommand(target, 'Input.insertText', { text: value });
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
    if (foreignLease) await restoreForeignExtensionFrames(target.tabId, foreignLease);
  }
}

function inspectSelectedTicketOption(selector, value) {
  const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().replace(/^\$\s*/, '').replace(/~$/, '').trim().toLowerCase();
  const inputs = [...document.querySelectorAll(selector === 'ticket-status' ? 'input.cw_status' : selector)]
    .filter((input) => input.getBoundingClientRect().width > 0 && input.getBoundingClientRect().height > 0
      && (selector !== 'ticket-status' || (/^Status\s*:/i.test(input.closest('tr')?.innerText.trim() || '') || /^(pre-process|scheduled remote|scheduled onsite|working issue now|scheduling required|waiting parts\/repair|waiting client response|waiting on 3rd party|waiting for next onsite visit|pending closure|completed|closed|closed\/client unresponsive)\s*~?$/i.test((input.value || '').trim()))));
  const pickerOpen = ['ticket-status', 'input.cw_workType', 'input.cw_ticketOwner'].includes(selector) && [...document.querySelectorAll(selector === 'ticket-status' ? '.gwt-dropdown-options > .mm_label' : '.gwt-dropdown-options .mm_label')]
    .some((option) => option.getBoundingClientRect().width > 0 && option.getBoundingClientRect().height > 0);
  return { verified: inputs.length === 1 && normalize(inputs[0].value) === normalize(value) && !pickerOpen,
    pickerOpen,
    displayed: inputs.length === 1 ? inputs[0].value : null, count: inputs.length };
}

async function chooseTicketOptionInTab(tabId, frameId, selector, value, ticketId = null) {
  await chrome.tabs.update(tabId, { active: true });
  const target = { tabId, frameIds: [frameId] };
  let [choice] = await executeConnectWiseScript({
    target, func: locateTicketOption, args: [selector, value]
  });
  if (selector === 'ticket-status' && !choice.result?.alreadySelected && !choice.result?.found) {
    if (choice.result?.readOnly) {
      throw new Error(`ticket-status: Completed was not offered and Status is read-only (visible choices: ${choice.result.options?.join(', ') || 'none'}).`);
    }
    await typeTicketStatusSearch(tabId, frameId, value);
    [choice] = await executeConnectWiseScript({
      target, func: locateTicketOption, args: [selector, value, true]
    });
  }
  if (selector === 'input.cw_ticketOwner' && !choice.result?.alreadySelected && !choice.result?.found && !choice.result?.readOnly) {
    await trustedTicketText(tabId, frameId, selector, value, false);
    [choice] = await executeConnectWiseScript({ target, func: locateTicketOption, args: [selector, value, true] });
  }
  if (!choice.result?.alreadySelected) {
    if (!choice.result?.found) throw new Error(`${selector}: ${value} choice was not located (field: ${JSON.stringify(choice.result?.displayed)}, visible choices: ${choice.result?.options?.join(', ') || 'none'}).`);
    if (selector === 'ticket-status' && ticketId) {
      await trustedTicketControlClick(tabId, frameId, ticketId, 'status-option', value);
    } else if (selector === 'input.cw_workType' && ticketId) {
      await trustedTicketControlClick(tabId, frameId, ticketId, 'time-option', value, selector);
    } else if (selector === 'input.cw_ticketOwner' && ticketId) {
      await trustedTicketControlClick(tabId, frameId, ticketId, 'owner-option', value, selector);
    } else {
      await browserMouse(tabId, choice.result, false);
    }
  }
  let stable = 0;
  let last;
  for (let attempt = 0; attempt < 24; attempt++) {
    const [check] = await executeConnectWiseScript({
      target, func: inspectSelectedTicketOption, args: [selector, value]
    });
    last = check.result;
    stable = last?.verified ? stable + 1 : 0;
    if (stable >= 4) return { selected: last.displayed };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${selector} did not retain ${value}: displayed ${JSON.stringify(last?.displayed)}, visible controls ${last?.count ?? 0}, picker open ${Boolean(last?.pickerOpen)}.`);
}

async function locateCompanySuggestion(company) {
  const visible = (el) => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const input = [...document.querySelectorAll('input.cw_company')].filter(visible);
  if (input.length !== 1) throw new Error(`Company picker expected one visible input, found ${input.length}.`);
  let openedPicker = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const matches = [...document.querySelectorAll('.gwt-dropdown-options > .mm_label')]
      .filter((el) => visible(el) && el.textContent.trim() === company);
    if (matches.length === 1) {
      const rect = matches[0].getBoundingClientRect();
      let x = rect.left + rect.width / 2;
      let y = rect.top + rect.height / 2;
      let view = window;
      while (view !== view.top) {
        const frame = view.frameElement;
        if (!frame) throw new Error('Company picker frame position could not be mapped.');
        const bounds = frame.getBoundingClientRect();
        x += bounds.left + frame.clientLeft;
        y += bounds.top + frame.clientTop;
        view = view.parent;
      }
      if (x < 0 || y < 0 || x >= view.innerWidth || y >= view.innerHeight) {
        throw new Error('Company suggestion is outside the visible browser area.');
      }
      return { x, y, found: true };
    }
    if (matches.length > 1) throw new Error('Company picker returned ambiguous matches.');
    if (attempt === 9 && !openedPicker) {
      const current = [...document.querySelectorAll('input.cw_company')].filter(visible);
      const arrow = current[0]?.nextElementSibling?.tagName === 'DIV'
        ? current[0].nextElementSibling : current[0]?.parentElement?.querySelector('input + div');
      if (visible(arrow)) { arrow.click(); openedPicker = true; }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const current = [...document.querySelectorAll('input.cw_company')].filter(visible)[0];
  throw new Error(`Company suggestion ${company} was not found (field text: ${JSON.stringify(current?.value || '')}, read-only: ${Boolean(current?.readOnly)}, picker opened: ${openedPicker}).`);
}

function inspectCompanyDefaults(ticket) {
  const visible = (selector) => [...document.querySelectorAll(selector)].filter((el) =>
    el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  const normalize = (value) => String(value || '').trim().replace(/^\$\s*/, '').toLowerCase();
  const fields = [
    ['input.cw_company', ticket.company],
    ['input.cw_contact', ticket.contact],
    ['input.cw_companyViewCompanyAddress', ticket.site],
    ['input.cw_agreement', ticket.agreement]
  ];
  const mismatches = fields.flatMap(([selector, expected]) => {
    const inputs = visible(selector);
    if (inputs.length !== 1) return [`${selector}: found ${inputs.length} visible controls`];
    return normalize(inputs[0].value) === normalize(expected) ? []
      : [`${selector}: displayed ${JSON.stringify(inputs[0].value)}`];
  });
  return { verified: mismatches.length === 0, mismatches };
}

function inspectNewTicketDraft(ticket) {
  const visible = (el) => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const one = (selector) => {
    const matches = [...document.querySelectorAll(selector)].filter(visible);
    if (matches.length !== 1) throw new Error(`${selector}: expected one visible control.`);
    return matches[0];
  };
  const normalize = (value) => String(value || '').trim().replace(/^\$\s*/, '').replace(/~$/, '').trim().toLowerCase();
  try {
    for (const [selector, value] of [
      ['input.cw_PsaSummaryHeader', ticket.summary], ['input.cw_company', ticket.company],
      ['input.cw_contact', ticket.contact], ['input.cw_companyViewCompanyAddress', ticket.site],
      ['input.cw_serviceBoard', ticket.board], ['input.cw_type', ticket.type],
      ['input.cw_subType', ticket.subtype], ['input.cw_agreement', ticket.agreement],
      ['input.cw_source', ticket.source], ['textarea[placeholder="Enter Initial Description..."]', ticket.description]
    ]) {
      const actual = one(selector).value;
      if (normalize(actual) !== normalize(value)) {
        throw new Error(`${selector} differs from work plan: displayed ${JSON.stringify(actual)}.`);
      }
    }
    const statuses = [...document.querySelectorAll('input.cw_status')].filter((input) =>
      visible(input) && (/^Status\s*:/i.test(input.closest('tr')?.innerText.trim() || '') || /^(pre-process|scheduled remote|scheduled onsite|working issue now|scheduling required|waiting parts\/repair|waiting client response|waiting on 3rd party|waiting for next onsite visit|pending closure|completed|closed|closed\/client unresponsive)\s*~?$/i.test((input.value || '').trim())));
    if (statuses.length !== 1 || normalize(statuses[0].value) !== normalize(ticket.status)) {
      throw new Error('Ticket Status differs.');
    }
    const priority = [...new Set([...document.querySelectorAll('.cw_Priority')]
      .filter(visible).map((label) => label.closest('tr')).filter(Boolean))];
    if (priority.length !== 1 || !normalize(priority[0].innerText).endsWith(normalize(ticket.priority))) {
      throw new Error('Ticket Priority differs.');
    }
    for (const label of ['Contact:', 'Resources:', 'Cc:']) {
      const checkboxes = [...new Set([...document.querySelectorAll('*')]
        .filter((el) => el.children.length < 3 && el.textContent.trim() === label)
        .map((el) => el.querySelector('input[type="checkbox"]')).filter(visible))];
      if (checkboxes.length !== 1 || checkboxes[0].checked) {
        throw new Error(`${label} ticket email recipient was not cleared.`);
      }
    }
    return { verified: true };
  } catch (error) { return { verified: false, error: error.message }; }
}

function clearNewTicketEmail() {
  const labels = ['Contact:', 'Resources:', 'Cc:'];
  for (const label of labels) {
    const matches = [...document.querySelectorAll('*')].filter((el) =>
      el.children.length < 3 && el.textContent.trim() === label
      && el.querySelector('input[type="checkbox"]')?.getBoundingClientRect().width > 0);
    const checkboxes = [...new Set(matches.map((el) => el.querySelector('input[type="checkbox"]')))];
    if (checkboxes.length !== 1) throw new Error(`${label} email checkbox was not unique.`);
    if (checkboxes[0].checked) checkboxes[0].click();
    if (checkboxes[0].checked) throw new Error(`${label} email checkbox could not be cleared.`);
  }
  return { cleared: true };
}

function clickNewTicketSave() {
  const buttons = [...document.querySelectorAll('.cw_ToolbarButton_Save')]
    .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  if (buttons.length !== 1) throw new Error('New Ticket Save button was not unique.');
  buttons[0].click();
  return { clicked: true };
}

function inspectCreatedTicket(ticket) {
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-\s*([^\n]+)/);
  const notice = /You have successfully updated this record/i.test(document.body?.innerText || '');
  const summary = [...document.querySelectorAll('input.cw_PsaSummaryHeader')]
    .find((el) => el.getBoundingClientRect().width > 0)?.value;
  return { verified: Boolean(header && notice && summary === ticket.summary),
    ticketId: header ? Number(header[1]) : null, summary };
}

function inspectSavedTicketAttributes(ticketId, ticket) {
  const visible = (el) => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-\s*([^\n]+)/);
  const normalize = (value) => String(value || '').trim().replace(/^\$\s*/, '').replace(/~$/, '').trim().toLowerCase();
  try {
    if (!header || Number(header[1]) !== Number(ticketId)) throw new Error('Saved ticket ID differs.');
    for (const [selector, value] of [
      ['input.cw_PsaSummaryHeader', ticket.summary], ['input.cw_company', ticket.company],
      ['input.cw_contact', ticket.contact], ['input.cw_companyViewCompanyAddress', ticket.site],
      ['input.cw_serviceBoard', ticket.board], ['input.cw_type', ticket.type],
      ['input.cw_subType', ticket.subtype],
      ['input.cw_agreement', ticket.agreement], ['input.cw_source', ticket.source]
    ]) {
      const values = [...document.querySelectorAll(selector)].filter(visible).map((el) => el.value);
      if (values.length !== 1 || normalize(values[0]) !== normalize(value)) throw new Error(`${selector} was not saved as requested.`);
    }
    const statuses = [...document.querySelectorAll('input.cw_status')].filter((input) =>
      visible(input) && (/^Status\s*:/i.test(input.closest('tr')?.innerText.trim() || '') || /^(pre-process|scheduled remote|scheduled onsite|working issue now|scheduling required|waiting parts\/repair|waiting client response|waiting on 3rd party|waiting for next onsite visit|pending closure|completed|closed|closed\/client unresponsive)\s*~?$/i.test((input.value || '').trim())));
    if (statuses.length !== 1 || normalize(statuses[0].value) !== normalize(ticket.status)) {
      throw new Error('Saved ticket Status differs.');
    }
    const priority = [...new Set([...document.querySelectorAll('.cw_Priority')]
      .filter(visible).map((label) => label.closest('tr')).filter(Boolean))];
    if (priority.length !== 1 || !normalize(priority[0].innerText).endsWith(normalize(ticket.priority))) {
      throw new Error('Saved ticket Priority differs.');
    }
    if (!(document.body?.innerText || '').includes(ticket.description)) {
      throw new Error('Initial Description was not found on the saved ticket.');
    }
    return { verified: true };
  } catch (error) { return { verified: false, error: error.message }; }
}

async function verifyCreatedTicketAfterReload(tabId, ticketId, ticket) {
  await chrome.tabs.reload(tabId);
  let lastError = 'the saved ticket form did not finish loading';
  let stableChecks = 0;
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const refreshed = await matchingFrame(tabId, ticketId, inspectTicketFrame);
      const [attributes] = await executeConnectWiseScript({
        target: { tabId, frameIds: [refreshed.frameId] },
        func: inspectSavedTicketAttributes, args: [String(ticketId), ticket]
      });
      if (attributes.result?.verified) {
        stableChecks++;
        if (stableChecks >= 3) return { ok: true, ticketId, saved: true, verified: true };
      } else {
        stableChecks = 0;
        lastError = attributes.result?.error || 'saved ticket attributes differ';
      }
    } catch (error) {
      stableChecks = 0;
      lastError = error.message;
    }
  }
  const error = new Error(`Ticket #${ticketId} was created, but its saved attributes were not verified after reload: ${lastError}.`);
  error.ticketId = ticketId;
  throw error;
}

async function createTicketInTab({ tabId, ticket }) {
  const search = await findTicketsInTab({ tabId, ticket });
  if (search.matches.length) throw new Error('A matching ticket exists. Stop before creating a duplicate.');
  if (ticket.titleContains) {
    const { titleContains, ...exactTicket } = ticket;
    const exact = await findTicketsInTab({ tabId, ticket: exactTicket });
    if (exact.matches.length) throw new Error('A ticket with this exact title exists. Stop before creating a duplicate.');
  }
  const frames = await executeConnectWiseScript({ target: { tabId, allFrames: true }, func: inspectBoardFrame });
  const boards = frames.filter((frame) => frame.result?.matches);
  if (boards.length !== 1) throw new Error('Service Board List changed before New Ticket.');
  await executeConnectWiseScript({
    target: { tabId, frameIds: [boards[0].frameId] }, func: clickBoardNewTicket
  });
  let newFrame;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const found = await executeConnectWiseScript({ target: { tabId, allFrames: true }, func: inspectNewTicketFrame });
    const matches = found.filter((frame) => frame.result?.matches);
    if (matches.length === 1) { newFrame = matches[0].frameId; break; }
    if (matches.length > 1) throw new Error('Multiple New Ticket forms appeared.');
  }
  if (newFrame === undefined) throw new Error('New Ticket form was not verified.');
  const target = { tabId, frameIds: [newFrame] };
  // ConnectWise may replace the search text while resolving autocomplete options.
  // Verify the selected option and its dependent defaults, not transient typing.
  await trustedTicketText(tabId, newFrame, 'input.cw_company', ticket.company, false);
  const [companyChoice] = await executeConnectWiseScript({
    target, func: locateCompanySuggestion, args: [ticket.company]
  });
  if (!companyChoice.result?.found) throw new Error('Exact Company suggestion was not located.');
  await browserMouse(tabId, companyChoice.result, false);
  let companyDefaults;
  let stableChecks = 0;
  for (let attempt = 0; attempt < 24; attempt++) {
    const [check] = await executeConnectWiseScript({ target, func: inspectCompanyDefaults, args: [ticket] });
    companyDefaults = check.result;
    stableChecks = companyDefaults?.verified ? stableChecks + 1 : 0;
    if (stableChecks >= 4) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (stableChecks < 4) {
    throw new Error(`Company selection did not populate the expected fields: ${companyDefaults?.mismatches?.join('; ') || 'unknown mismatch'}.`);
  }
  await chooseTicketOptionInTab(tabId, newFrame, 'input.cw_serviceBoard', ticket.board);
  const statusSelector = 'ticket-status';
  for (const [selector, value] of [
    [statusSelector, ticket.status], ['input.cw_type', ticket.type], ['input.cw_subType', ticket.subtype]
  ]) {
    await chooseTicketOptionInTab(tabId, newFrame, selector, value);
  }
  await trustedTicketText(tabId, newFrame, 'input.cw_PsaSummaryHeader', ticket.summary);
  await trustedTicketText(tabId, newFrame, 'textarea[placeholder="Enter Initial Description..."]', ticket.description);
  await executeConnectWiseScript({ target, func: clearNewTicketEmail });
  const [draft] = await executeConnectWiseScript({ target, func: inspectNewTicketDraft, args: [ticket] });
  if (!draft.result?.verified) throw new Error(draft.result?.error || 'New Ticket draft failed verification.');
  await executeConnectWiseScript({ target, func: clickNewTicketSave });
  let observedTicketId = null;
  let stableSavedChecks = 0;
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const frames = await executeConnectWiseScript({
        target: { tabId, allFrames: true }, func: inspectCreatedTicket, args: [ticket]
      });
      const saved = frames.filter((frame) => frame.result?.verified);
      if (saved.length > 1) throw new Error('Multiple saved ticket views appeared after Save.');
      if (saved.length === 1) {
        const ticketId = saved[0].result.ticketId;
        stableSavedChecks = ticketId === observedTicketId ? stableSavedChecks + 1 : 1;
        observedTicketId = ticketId;
        if (stableSavedChecks >= 3) return verifyCreatedTicketAfterReload(tabId, ticketId, ticket);
      } else stableSavedChecks = 0;
    } catch (error) {
      if (/Multiple saved ticket views/.test(error.message)) throw error;
      stableSavedChecks = 0;
      // The ConnectWise frame can be replaced while Save navigates to the ticket.
    }
  }
  const error = new Error(observedTicketId
    ? `Ticket #${observedTicketId} appeared after Save, but the saved view did not remain stable.`
    : 'Ticket Save was clicked, but a saved ticket ID was not verified.');
  if (observedTicketId) error.ticketId = observedTicketId;
  throw error;
}

function clickBoardTicketRow(ticketId) {
  const rows = [...document.querySelectorAll('tr')].filter((row) => {
    const cells = [...row.children].filter((cell) => cell.tagName === 'TD');
    return cells[1]?.innerText.trim() === String(ticketId);
  });
  if (rows.length !== 1) throw new Error(`Ticket #${ticketId} was not unique in the search results.`);
  const cell = [...rows[0].children].filter((item) => item.tagName === 'TD')[1];
  cell.click();
  return { clicked: true };
}

function boardTicketNumber(ticketId, action, filterId = null) {
  if (!/^\d+$/.test(String(ticketId))) throw new Error('A numeric ticket ID is required.');
  const visible = (element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
  if (action === 'search') {
    const clear = [...document.querySelectorAll('.cw-toolbar-clear')].filter(visible);
    if (clear.length !== 1) throw new Error('Expected one visible Clear search control.');
    clear[0].click();
  }
  const inputs = [...document.querySelectorAll('input[id$="-input"]')].filter(visible);
  const numberLabel = (text) => /^(?:ticket\s*(?:#|number|no\.?|id)?|service\s*ticket\s*(?:#|number|id)|id)\s*:?$/i.test(text.trim());
  const matches = filterId ? inputs.filter((input) => input.id === filterId) : inputs.filter((input) => {
    if (/^(?:SR_Service_RecID|TicketNumber|TicketNbr|TicketId|Ticket_ID)-input$/i.test(input.id)) return true;
    if (numberLabel(input.getAttribute('aria-label') || '') || numberLabel(input.getAttribute('placeholder') || '')) return true;
    const cell = input.closest('td, th');
    if (!cell) return false;
    if (numberLabel(cell.innerText || '')) return true;
    const row = cell.parentElement;
    const column = [...row.children].indexOf(cell);
    const table = cell.closest('table');
    return Boolean(table && [...table.querySelectorAll('tr')].some((header) => header !== row
      && numberLabel(header.children[column]?.innerText || '')));
  });
  if (matches.length !== 1) throw new Error(`Expected one visible Ticket number filter, found ${matches.length}.`);
  const numberInput = matches[0];
  if (action === 'search') {
    const one = (selector) => {
      const controls = [...document.querySelectorAll(selector)].filter(visible);
      if (controls.length !== 1) throw new Error(`${selector}: expected one visible control.`);
      return controls[0];
    };
    // An explicit ID is the complete lookup. Clear all other list filter inputs.
    for (const input of inputs) {
      const value = input === numberInput ? String(ticketId) : '';
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (input.value !== value) throw new Error(`${input.id} did not retain the ticket-number search filter.`);
    }
    one('.cw-toolbar-search').click();
    return { searched: true, filterId: numberInput.id };
  }
  if (numberInput.value !== String(ticketId) || inputs.some((input) => input !== numberInput && input.value.trim())) {
    return { ready: false, reason: 'Ticket-number-only search filters changed.' };
  }
  const text = document.body?.innerText || '';
  const count = text.match(/View\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i);
  const noResults = /No records found|No results found/i.test(text);
  if (!count && !noResults) return { ready: false, reason: 'Search result count is not visible.' };
  const rows = [...document.querySelectorAll('tr')].map((row) =>
    [...row.children].filter((cell) => cell.tagName === 'TD').map((cell) => cell.innerText.trim()))
    .filter((cells) => cells.length > 1 && /^\d+$/.test(cells[1] || ''));
  if (rows.some((cells) => Number(cells[1]) !== Number(ticketId))) {
    return { ready: false, reason: 'Waiting for ticket-number search results.' };
  }
  if (count && Number(count[2]) < Number(count[3])) {
    return { ready: false, reason: 'Ticket-number search has additional pages.', paginated: true };
  }
  return { ready: true, matches: rows.map((cells) => ({ ticketId: Number(cells[1]) })),
    total: count ? Number(count[3]) : 0 };
}

async function findTicketNumberInTab(tabId, ticketId) {
  const board = await ensureServiceBoard(tabId);
  const target = { tabId, frameIds: [board.frameId] };
  const [search] = await executeConnectWiseScript({ target, func: boardTicketNumber,
    args: [String(ticketId), 'search'] });
  if (!search?.result?.searched) throw new Error('Ticket-number search was not started.');
  let emptySince = null;
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      await inspectTicketInTab({ tabId, ticketId });
      return { ok: true, matches: [{ ticketId: Number(ticketId) }] };
    } catch { /* A unique result may open automatically; otherwise inspect the list. */ }
    const [result] = await executeConnectWiseScript({ target, func: boardTicketNumber,
      args: [String(ticketId), 'inspect', search.result.filterId] });
    if (result.result?.paginated) throw new Error(result.result.reason);
    if (result.result?.ready) {
      if (result.result.matches.length) return { ok: true, matches: result.result.matches };
      if (emptySince === null) emptySince = Date.now();
      if (Date.now() - emptySince >= 3000) return { ok: true, matches: [] };
    } else emptySince = null;
  }
  throw new Error(`Ticket #${ticketId} number search was not verified.`);
}

async function openTicketInTab({ tabId, ticketId, ticket, numberOnly = false }) {
  await connectwiseTab(tabId);
  if (!Number.isSafeInteger(Number(ticketId)) || Number(ticketId) <= 0) throw new Error('A positive ticket number is required.');
  const identity = (open) => numberOnly || (open.summary === ticket.summary
    && open.company === ticket.company && open.site === ticket.site);
  try {
    const open = await inspectTicketInTab({ tabId, ticketId });
    if (identity(open)) return { ok: true, ticketId: Number(ticketId), verified: true };
  } catch { /* Locate the ticket through the Service Board. */ }
  const search = numberOnly ? await findTicketNumberInTab(tabId, ticketId) : await findTicketsInTab({ tabId, ticket });
  const matches = search.matches.filter((match) => match.ticketId === Number(ticketId));
  if (matches.length !== 1) throw new Error(numberOnly
    ? `Ticket #${ticketId} was not found by number.`
    : `Ticket #${ticketId} was not found with the requested company, site, and summary.`);
  try {
    const opened = await inspectTicketInTab({ tabId, ticketId });
    if (identity(opened)) return { ok: true, ticketId: Number(ticketId), verified: true };
  } catch { /* The result is still on the Service Board list. */ }
  const frames = await executeConnectWiseScript({ target: { tabId, allFrames: true }, func: inspectBoardFrame });
  const boards = frames.filter((frame) => frame.result?.matches);
  if (boards.length !== 1) throw new Error('Service Board List changed before opening the ticket.');
  await executeConnectWiseScript({
    target: { tabId, frameIds: [boards[0].frameId] }, func: clickBoardTicketRow, args: [String(ticketId)]
  });
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const open = await inspectTicketInTab({ tabId, ticketId });
      if (identity(open)) return { ok: true, ticketId: Number(ticketId), verified: true };
    } catch { /* Wait for ticket detail. */ }
  }
  throw new Error(`Ticket #${ticketId} was clicked but its identity was not verified.`);
}

function inspectTicketOwner(ticketId, owner) {
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-\s*([^\n]+)/)?.[0] || '';
  const inputs = [...document.querySelectorAll('input.cw_ticketOwner')].filter((el) =>
    el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  const actual = inputs.length === 1 ? inputs[0].value.trim().replace(/^\$\s*/, '') : null;
  return { matches: new RegExp(`Service Ticket #${ticketId}(?!\\d)`).test(header) && inputs.length === 1,
    owner: actual, verified: actual?.toLowerCase() === owner.toLowerCase() };
}

function locateTicketAction(ticketId, action) {
  const text = document.body?.innerText || '';
  if (!new RegExp(`Service Ticket #${ticketId}(?!\\d)`).test(text)) {
    throw new Error(`Ticket #${ticketId} is not open for ${action}.`);
  }
  const visible = (el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const pattern = action === 'assign-me' ? /^ASSIGN ME$/i
    : /^Resources\s*&\s*Meetings(?:\s*\d+)?$/i;
  const matches = [...document.querySelectorAll('button, a, div, span')]
    .filter((el) => visible(el) && pattern.test(el.textContent.trim().replace(/\s+/g, ' '))
      && ![...el.children].some((child) => visible(child)
        && pattern.test(child.textContent.trim().replace(/\s+/g, ' '))));
  if (matches.length !== 1) return { found: false, count: matches.length };
  matches[0].scrollIntoView({ block: 'center', inline: 'nearest' });
  const rect = matches[0].getBoundingClientRect();
  let x = rect.left + rect.width / 2;
  let y = rect.top + rect.height / 2;
  let view = window;
  while (view !== view.top) {
    const frame = view.frameElement;
    if (!frame) throw new Error(`${action} frame position could not be mapped.`);
    const bounds = frame.getBoundingClientRect();
    const scaleX = frame.offsetWidth ? bounds.width / frame.offsetWidth : 1;
    const scaleY = frame.offsetHeight ? bounds.height / frame.offsetHeight : 1;
    x = bounds.left + (x + frame.clientLeft) * scaleX;
    y = bounds.top + (y + frame.clientTop) * scaleY;
    view = view.parent;
  }
  if (x < 0 || y < 0 || x >= view.innerWidth || y >= view.innerHeight) {
    throw new Error(`${action} is outside the visible browser area.`);
  }
  return { found: true, x, y };
}

async function addSignedInTicketResource(tabId, frameId, ticketId) {
  const target = { tabId, frameIds: [frameId] };
  let [action] = await executeConnectWiseScript({ target, func: locateTicketAction, args: [String(ticketId), 'assign-me'] });
  if (!action.result?.found) {
    await trustedTicketControlClick(tabId, frameId, ticketId, 'resources-and-meetings');
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      [action] = await executeConnectWiseScript({ target, func: locateTicketAction, args: [String(ticketId), 'assign-me'] });
      if (action.result?.found) break;
    }
  }
  if (!action.result?.found) throw new Error('Assign Me was not found while adding the signed-in resource.');
  await trustedTicketControlClick(tabId, frameId, ticketId, 'assign-me');
}

async function ensureTicketOwnerInTab(message) {
  // Keep popup monitoring active across focus, dropdown selection and Save.
  // A password-manager iframe may appear only after debugger attachment.
  const lease = await temporarilyPauseForeignExtensionFrames(message.tabId, true);
  try { return await ensureTicketOwnerWithFrameProtection(message); }
  finally { await restoreForeignExtensionFrames(message.tabId, lease); }
}

async function ensureTicketOwnerWithFrameProtection({ tabId, ticketId, owner }) {
  if (typeof owner !== 'string' || !owner.trim()) throw new Error('Ticket owner is required.');
  const found = await matchingFrame(tabId, ticketId, inspectTicketFrame);
  const target = { tabId, frameIds: [found.frameId] };
  const [before] = await executeConnectWiseScript({ target, func: inspectTicketOwner,
    args: [String(ticketId), owner] });
  if (!before.result?.matches) throw new Error('Saved Ticket Owner field was not uniquely found.');
  if (before.result.verified) return { ok: true, verified: true, owner, alreadySet: true };
  const reassignment = Boolean(before.result.owner && !/^\(?unassigned\)?\s*~?$/i.test(before.result.owner));
  if (reassignment) {
    try {
      await chooseTicketOptionInTab(tabId, found.frameId, 'input.cw_ticketOwner', owner, ticketId);
    } catch (error) {
      if (!/input\.cw_ticketOwner: .*choice was not located/.test(error.message)) throw error;
      await addSignedInTicketResource(tabId, found.frameId, ticketId);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const refreshed = await matchingFrame(tabId, ticketId, inspectTicketFrame);
      await chooseTicketOptionInTab(tabId, refreshed.frameId, 'input.cw_ticketOwner', owner, ticketId);
    }
  } else {
  let [action] = await executeConnectWiseScript({
    target, func: locateTicketAction, args: [String(ticketId), 'assign-me']
  });
  if (!action.result?.found) {
    const [section] = await executeConnectWiseScript({
      target, func: locateTicketAction, args: [String(ticketId), 'resources-and-meetings']
    });
    if (!section.result?.found) throw new Error('Resources & Meetings section was not uniquely found.');
    await trustedTicketControlClick(tabId, found.frameId, ticketId, 'resources-and-meetings');
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      [action] = await executeConnectWiseScript({
        target, func: locateTicketAction, args: [String(ticketId), 'assign-me']
      });
      if (action.result?.found) break;
    }
  }
  if (!action.result?.found) throw new Error('Assign Me was not found in Resources & Meetings.');
  await trustedTicketControlClick(tabId, found.frameId, ticketId, 'assign-me');
  }
  let savedFrame;
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try { savedFrame = await matchingFrame(tabId, ticketId, inspectTicketFrame); break; }
    catch { /* Wait for the assignment action to update the ticket. */ }
  }
  if (!savedFrame) throw new Error(`Assign Me was clicked, but ticket #${ticketId} did not return.`);
  // Give ConnectWise time to apply the assignment before saving the ticket form.
  let assignmentObserved = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      savedFrame = await matchingFrame(tabId, ticketId, inspectTicketFrame);
      const [check] = await executeConnectWiseScript({
        target: { tabId, frameIds: [savedFrame.frameId] }, func: inspectTicketOwner,
        args: [String(ticketId), owner]
      });
      if (check.result?.verified) { assignmentObserved = true; break; }
    } catch { /* The assignment may still be rerendering the ticket. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!assignmentObserved) throw new Error(`Owner assignment did not set Ticket Owner to ${owner} on #${ticketId}. No ticket Save or time entry was attempted.`);
  await trustedTicketSave(tabId, savedFrame.frameId, ticketId);
  let confirmed = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const current = await matchingFrame(tabId, ticketId, inspectTicketFrame);
      const [check] = await executeConnectWiseScript({
        target: { tabId, frameIds: [current.frameId] }, func: inspectTicketOwner,
        args: [String(ticketId), owner]
      });
      if (check.result?.verified) { confirmed = true; break; }
    } catch { /* Wait for the saved ticket view. */ }
  }
  if (!confirmed) throw new Error(`Assign Me was clicked on ticket #${ticketId}, but Ticket Owner ${owner} did not appear after Save.`);
  await chrome.tabs.reload(tabId);
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const refreshed = await matchingFrame(tabId, ticketId, inspectTicketFrame);
      const [check] = await executeConnectWiseScript({
        target: { tabId, frameIds: [refreshed.frameId] }, func: inspectTicketOwner,
        args: [String(ticketId), owner]
      });
      if (check.result?.verified) return { ok: true, verified: true, owner, saved: true,
        method: reassignment ? 'owner-dropdown' : 'assign-me' };
    } catch { /* Wait for the saved ticket to reload. */ }
  }
  throw new Error(`Assign Me was clicked on ticket #${ticketId}, but Ticket Owner ${owner} was not verified after reload.`);
}

async function locateTicketSaveButton(ticketId, reveal = false) {
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-/);
  if (!header || header[1] !== String(ticketId)) {
    throw new Error(`Ticket #${ticketId} was not visible before Save.`);
  }
  const visible = (el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const buttons = [...document.querySelectorAll('.cw_ToolbarButton_Save')].filter(visible);
  if (buttons.length !== 1) throw new Error(`Expected one visible ticket Save button, found ${buttons.length}.`);
  if (reveal) {
    buttons[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const rect = buttons[0].getBoundingClientRect();
  let x = rect.left + rect.width / 2;
  let y = rect.top + rect.height / 2;
  let view = window;
  while (view !== view.top) {
    const frame = view.frameElement;
    if (!frame) throw new Error('Ticket Save frame position could not be mapped.');
    const bounds = frame.getBoundingClientRect();
    const scaleX = frame.offsetWidth ? bounds.width / frame.offsetWidth : 1;
    const scaleY = frame.offsetHeight ? bounds.height / frame.offsetHeight : 1;
    x = bounds.left + (x + frame.clientLeft) * scaleX;
    y = bounds.top + (y + frame.clientTop) * scaleY;
    view = view.parent;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)
    || x < 0 || y < 0 || x >= view.innerWidth || y >= view.innerHeight) {
    throw new Error('Ticket Save is outside the visible browser area.');
  }
  return { x, y };
}

async function trustedTicketSave(tabId, frameId, ticketId, expectedStatus = '') {
  await chrome.tabs.update(tabId, { active: true });
  await executeConnectWiseScript({ target: { tabId, frameIds: [frameId] },
    func: armTicketSaveObservation, args: [String(ticketId)] });
  const [result] = await executeConnectWiseScript({
    target: { tabId, frameIds: [frameId] }, func: activateExactTicketSave,
    args: [String(ticketId), expectedStatus]
  });
  if (!result?.result?.activated) throw new Error('Exact ticket Save was not activated.');
}

function activateExactTicketSave(ticketId, expectedStatus) {
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-/);
  if (header?.[1] !== String(ticketId)) throw new Error('Ticket identity changed before Save.');
  const visible = (el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const buttons = [...document.querySelectorAll('.cw_ToolbarButton_Save')].filter(visible);
  if (buttons.length !== 1) throw new Error(`Expected one visible ticket Save button, found ${buttons.length}.`);
  const button = buttons[0];
  if (button.closest('[inert]') || button.getAttribute('aria-disabled') === 'true'
    || button.disabled) throw new Error('Ticket Save is disabled.');
  if (expectedStatus) {
    const normalize = (value) => String(value || '').trim().replace(/~$/, '').trim().toLowerCase();
    const statuses = [...document.querySelectorAll('input.cw_status')].filter(visible);
    if (statuses.length !== 1 || normalize(statuses[0].value) !== normalize(expectedStatus)
      || [...document.querySelectorAll('.gwt-dropdown-options')].some(visible)) {
      throw new Error('Ticket Status changed before Save or its picker is still open.');
    }
  }
  // Activate the verified page element directly: browser-coordinate clicks can
  // reach password-manager controls when browser zoom or overlays change.
  if (globalThis.__cwTicketSaveObservation?.ticketId !== String(ticketId)) {
    throw new Error('Ticket Save confirmation observer was not armed.');
  }
  button.click();
  return { activated: true };
}

function inspectTicketClickHit(ticketId, role, value) {
  const element = this.nodeType === 1 ? this : this.parentElement;
  const header = element?.ownerDocument?.body?.innerText.match(/Service Ticket #(\d+)\s*-/);
  const charge = element?.ownerDocument?.querySelector('input.cw_ChargeToTextBox')?.value || '';
  const correctTicket = role === 'time-option'
    ? new RegExp(`(?:^|[^0-9])${ticketId}(?![0-9])`).test(charge)
    : header && header[1] === String(ticketId);
  if (!correctTicket) return { verified: false, reason: 'wrong ticket document' };
  if (['assign-me', 'resources-and-meetings'].includes(role)) {
    const pattern = role === 'assign-me' ? /^ASSIGN ME$/i : /^Resources\s*&\s*Meetings(?:\s*\d+)?$/i;
    let control = element;
    while (control && control !== element.ownerDocument.body) {
      if (pattern.test(control.textContent.trim().replace(/\s+/g, ' '))) return { verified: true };
      control = control.parentElement;
    }
    return { verified: false, reason: 'another control covers the assignment action' };
  }
  const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().replace(/^\$\s*/, '').replace(/~$/, '').trim().toLowerCase();
  const target = role === 'save' ? element.closest('.cw_ToolbarButton_Save')
    : element.closest('.gwt-dropdown-options .mm_label');
  return { verified: Boolean(target && (role === 'save' || normalize(target.textContent) === normalize(value))),
    reason: target ? 'target found' : 'another control covers the click point' };
}

async function verifyTicketClickHit(target, point, ticketId, role, value) {
  const hit = await chrome.debugger.sendCommand(target, 'DOM.getNodeForLocation', {
    x: Math.round(point.x), y: Math.round(point.y), includeUserAgentShadowDOM: false
  });
  if (!hit?.backendNodeId) throw new Error(`Ticket ${role}: browser hit test found no control.`);
  const resolved = await chrome.debugger.sendCommand(target, 'DOM.resolveNode', { backendNodeId: hit.backendNodeId });
  const objectId = resolved?.object?.objectId;
  if (!objectId) throw new Error(`Ticket ${role}: browser hit target could not be inspected.`);
  try {
    const result = await chrome.debugger.sendCommand(target, 'Runtime.callFunctionOn', {
      objectId, functionDeclaration: inspectTicketClickHit.toString(), returnByValue: true,
      arguments: [{ value: String(ticketId) }, { value: role }, { value }]
    });
    if (result.exceptionDetails || !result.result?.value?.verified) {
      throw new Error(`Ticket ${role}: ${result.result?.value?.reason || 'browser click target did not match'}. No click was sent.`);
    }
  } finally {
    await chrome.debugger.sendCommand(target, 'Runtime.releaseObject', { objectId }).catch(() => {});
  }
}

function armTicketSaveObservation(ticketId) {
  globalThis.__cwTicketSaveObservation?.observer?.disconnect();
  const message = (element) => /^(?:You have successfully updated this record\.?|Successfully updated this record\.?)$/i
    .test((element?.textContent || '').trim());
  const notices = () => [...document.querySelectorAll('*')].filter((element) => message(element)
    && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
    && ![...element.children].some(message));
  const before = new Set(notices());
  const state = { ticketId: String(ticketId), fresh: false };
  state.observer = new MutationObserver((records) => {
    const current = notices();
    if (current.some((notice) => !before.has(notice)) || records.some((record) => {
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return current.some((notice) => notice === element || notice.contains(element));
    })) { state.fresh = true; state.observer.disconnect(); }
  });
  state.observer.observe(document.body, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['class', 'style'] });
  globalThis.__cwTicketSaveObservation = state;
  return { armed: true };
}

async function trustedTicketControlClick(tabId, frameId, ticketId, role, value = '', selector = 'ticket-status') {
  await chrome.tabs.update(tabId, { active: true });
  const target = { tabId };
  const scriptTarget = { tabId, frameIds: [frameId] };
  let attached = false;
  let foreignLease = null;
  try {
    // Attach before measuring: the browser's debugging notice can change the layout.
    foreignLease = await attachConnectWiseDebugger(target);
    attached = true;
    await new Promise((resolve) => setTimeout(resolve, 150));
    const locate = async (reveal = false) => {
      const [result] = await executeConnectWiseScript({ target: scriptTarget,
        func: role === 'save' ? locateTicketSaveButton
          : ['assign-me', 'resources-and-meetings'].includes(role) ? locateTicketAction : locateTicketOption,
        args: role === 'save' ? [String(ticketId), reveal]
          : ['assign-me', 'resources-and-meetings'].includes(role) ? [String(ticketId), role] : [selector, value, true] });
      const point = result?.result;
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error(`Ticket ${role} did not have a valid click position.`);
      }
      return point;
    };
    let point = await locate(true);
    let stable = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const next = await locate();
      if (Math.abs(point.x - next.x) < 0.5 && Math.abs(point.y - next.y) < 0.5) {
        point = next; stable = true; break;
      }
      point = next;
    }
    if (!stable) throw new Error(`Ticket ${role} position did not settle. No click was sent.`);
    await verifyTicketClickHit(target, point, ticketId, role, value);
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: point.x, y: point.y, button: 'none'
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const moved = await locate();
    if (Math.abs(point.x - moved.x) >= 0.5 || Math.abs(point.y - moved.y) >= 0.5) {
      throw new Error(`Ticket ${role} moved after hover. No click was sent.`);
    }
    await verifyTicketClickHit(target, moved, ticketId, role, value);
    if (role === 'save') {
      if (value) {
        const [status] = await executeConnectWiseScript({ target: scriptTarget,
          func: inspectSelectedTicketOption, args: ['ticket-status', value] });
        if (!status?.result?.verified) {
          throw new Error(`Ticket Status changed before Save or its picker is still open. No click was sent.`);
        }
      }
      const [armed] = await executeConnectWiseScript({ target: scriptTarget,
        func: armTicketSaveObservation, args: [String(ticketId)] });
      if (!armed?.result?.armed) throw new Error('Ticket Save confirmation observer could not be armed.');
    }
    for (const type of ['mousePressed', 'mouseReleased']) {
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type, x: moved.x, y: moved.y, button: 'left', clickCount: 1
      });
    }
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
    if (foreignLease) await restoreForeignExtensionFrames(target.tabId, foreignLease);
  }
}

function verifyTicketStatus(ticketId, status) {
  const candidates = [...document.querySelectorAll('input.cw_status')].filter((input) =>
    input.getBoundingClientRect().width > 0 && input.getBoundingClientRect().height > 0);
  const labeled = candidates.filter((input) =>
    /^Status\s*:?(?:\s|$)/i.test(input.closest('tr')?.innerText.trim() || ''));
  const known = candidates.filter((input) =>
    /^(pre-process|scheduled remote|scheduled onsite|working issue now|scheduling required|waiting parts\/repair|waiting client response|waiting on 3rd party|waiting for next onsite visit|pending closure|completed|closed|closed\/client unresponsive)\s*~?$/i.test(input.value.trim()));
  const statuses = labeled.length === 1 ? labeled : known.length === 1 ? known
    : candidates.length === 1 ? candidates : [];
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-\s*([^\n]+)/)?.[0] || '';
  const normalize = (value) => String(value || '').trim().replace(/~$/, '').trim().toLowerCase();
  const savedMessage = /You have successfully updated this record/i.test(document.body?.innerText || '');
  const observation = globalThis.__cwTicketSaveObservation;
  const freshSaveMessage = observation?.ticketId === String(ticketId) && observation.fresh;
  const matches = statuses.length === 1 && new RegExp(`Service Ticket #${ticketId}(?!\\d)`).test(header);
  return { matches, status: statuses[0]?.value || null,
    freshSaveMessage: Boolean(freshSaveMessage),
    verified: matches && normalize(statuses[0].value) === normalize(status) && savedMessage && freshSaveMessage };
}

async function setTicketStatusInTab({ tabId, ticketId, status, forceSave = false }) {
  if (!['Scheduled Remote', 'Scheduled Onsite', 'Working Issue Now', 'Scheduling Required',
    'Waiting Parts/Repair', 'Waiting Client Response', 'Waiting on 3rd Party',
    'Waiting for next onsite visit', 'Pending Closure', 'Completed', 'Closed',
    'Closed/Client Unresponsive'].includes(status)) throw new Error('Unsupported ticket status.');
  let found;
  try { found = await matchingFrame(tabId, ticketId, inspectTicketFrame); }
  catch {
    const time = await matchingFrame(tabId, ticketId, inspectTimeRows);
    await executeConnectWiseScript({
      target: { tabId, frameIds: [time.frameId] }, func: clickTicketTab, args: [String(ticketId)]
    });
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      try { found = await matchingFrame(tabId, ticketId, inspectTicketFrame); break; }
      catch { /* Wait for Ticket tab. */ }
    }
  }
  if (!found) throw new Error('Ticket detail did not open from the Time list.');
  const { frameId, state } = found;
  const normalize = (value) => String(value || '').trim().replace(/~$/, '').trim().toLowerCase();
  if (!forceSave && normalize(state.status) === normalize(status) && status !== 'Completed') {
    return { ok: true, ticketId: Number(ticketId), status: state.status, alreadySet: true, saved: true };
  }
  const target = { tabId, frameIds: [frameId] };
  try {
    await chooseTicketOptionInTab(tabId, frameId, 'ticket-status', status, ticketId);
  } catch (error) {
    throw new Error(`status-option: ${error.message}`);
  }
  try {
    if (forceSave) {
      await executeConnectWiseScript({ target, func: clearStatusEmailRecipients });
    }
    await trustedTicketSave(tabId, frameId, ticketId, status);
  } catch (error) {
    throw new Error(`exact-save: ${error.message}`);
  }
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const [check] = await executeConnectWiseScript({
      target, func: verifyTicketStatus, args: [String(ticketId), status]
    });
    if (check.result?.verified) {
      await chrome.tabs.reload(tabId);
      for (let reloadAttempt = 0; reloadAttempt < 120; reloadAttempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          const refreshed = await matchingFrame(tabId, ticketId, inspectTicketFrame);
          if (normalize(refreshed.state.status) === normalize(status)) {
            return { ok: true, ticketId: Number(ticketId), status: refreshed.state.status,
              saved: true, alreadySet: false };
          }
        } catch { /* Wait for the ticket page to reload. */ }
      }
      throw new Error('Save notice appeared, but the status was not verified after reload.');
    }
  }
  throw new Error('exact-save-confirmation: Save element was activated once, but no fresh saved-status confirmation was verified. No coordinate click was sent for ticket Save. Stop before entering more time.');
}

function clearStatusEmailRecipients() {
  for (const label of ['Contact:', 'Resources:', 'Cc:']) {
    const inputs = [...new Set([...document.querySelectorAll('*')]
      .filter((el) => el.children.length < 3 && el.textContent.trim() === label)
      .map((el) => el.querySelector('input[type="checkbox"]')).filter(Boolean))];
    if (inputs.length > 1) throw new Error(`${label} email recipient is ambiguous. Save was not attempted.`);
    if (inputs[0]?.checked) inputs[0].click();
    if (inputs[0]?.checked) throw new Error(`${label} email recipient could not be cleared.`);
  }
}

async function verifyTicketStatusInTab({ tabId, ticketId, status }) {
  await connectwiseTab(tabId);
  const normalize = (value) => String(value || '').trim().replace(/~$/, '').trim().toLowerCase();
  try {
    const current = await matchingFrame(tabId, ticketId, inspectTicketFrame);
    if (normalize(current.state.status) === normalize(status)) {
      return { ok: true, verified: true, status: current.state.status };
    }
  } catch { /* The ticket view may still be loading. */ }
  await chrome.tabs.reload(tabId);
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const { state } = await matchingFrame(tabId, ticketId, inspectTicketFrame);
      return { ok: true, verified: normalize(state.status) === normalize(status), status: state.status };
    } catch { /* Wait for the ticket detail to reload. */ }
  }
  throw new Error('Ticket status could not be read after reload.');
}

function clickTicketTab(ticketId) {
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-\s*([^\n]+)/)?.[0] || '';
  if (!new RegExp(`Service Ticket #${ticketId}(?!\\d)`).test(header)) throw new Error('Ticket identity changed.');
  const tabs = [...document.querySelectorAll('span.GMDB3DUBOUI')].filter((el) =>
    el.getBoundingClientRect().width > 0 && el.textContent.trim() === 'Ticket');
  if (tabs.length !== 1) throw new Error('Ticket tab was not unique.');
  tabs[0].click();
  return { clicked: true };
}

function inspectTimeRows(ticketId) {
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-\s*([^\n]+)/)?.[0] || '';
  const chargeTo = [...document.querySelectorAll('input.cw_ChargeToTextBox')].some((el) =>
    el.getBoundingClientRect().width > 0 && new RegExp(`(^|\\D)${ticketId}(\\D|$)`).test(el.value));
  const timeHeader = [...document.querySelectorAll('.cw-ml-header')].some((el) =>
    el.getBoundingClientRect().height > 0 && /Start Time/i.test(el.innerText) && /End Time/i.test(el.innerText));
  const matches = (new RegExp(`Service Ticket #${ticketId}(?!\\d)`).test(header) || chargeTo)
    && timeHeader;
  if (!matches) return { matches: false, rows: [] };
  const rows = [...document.querySelectorAll('tr.cw-ml-row')]
    .filter((row) => row.getBoundingClientRect().height > 0).map((row) => {
    const detail = [...row.querySelectorAll('tr')].find((candidate) => {
      const cells = [...candidate.children].filter((cell) => cell.tagName === 'TD');
      return cells.length >= 7 && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(cells[2]?.innerText.trim() || '');
    });
    const cells = [...(detail?.querySelectorAll(':scope > td') || [])].map((cell) => cell.innerText.trim());
    const notes = row.innerText.match(/Notes:\s*([\s\S]*?)\s*Internal Notes:/i)?.[1]?.trim() || '';
    return { member: cells[1] || '', date: cells[2] || '', start: cells[3] || '',
      end: cells[4] || '', billable: cells[5] || '', hours: cells[6] || '',
      workType: cells[7] || '', workRole: cells[8] || '', location: cells[10] || '',
      businessUnit: cells[11] || '', agreement: cells[12] || '', notes };
  });
  const timeTabs = [...document.querySelectorAll('span.GMDB3DUBOUI')].filter((el) =>
    el.getBoundingClientRect().width > 0 && /^Time\s+\d+$/i.test(el.textContent.trim()));
  const total = timeTabs.length === 1 ? Number(timeTabs[0].textContent.trim().match(/\d+$/)[0]) : null;
  return { matches: true, rows, total, complete: total !== null && rows.length === total };
}

async function readTimeRowsInTab({ tabId, ticketId }) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { state } = await matchingFrame(tabId, ticketId, inspectTimeRows);
    if (state.complete) return { ok: true, ticketId: Number(ticketId), rows: state.rows };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('The Time list count differs from visible rows; duplicate check is incomplete.');
}

function timeRowMatchesEntryFields(row, entry) {
  const combo = (value) => String(value || '').replace(/\s+/g, ' ').trim().replace(/^\$/, '')
    .replace(/\s+/g, ' ').toLowerCase();
  return (entry.billable === 'AUTO' ? ['B', 'NB', 'NC'].includes(row.billable) : row.billable === entry.billable) && combo(row.workType) === combo(entry.workType)
    && combo(row.workRole) === combo(entry.workRole)
    && (!entry.location || combo(row.location) === combo(entry.location))
    && (!entry.businessUnit || combo(row.businessUnit) === combo(entry.businessUnit))
    && (!entry.agreement || combo(row.agreement) === combo(entry.agreement));
}

async function findTimeEntriesInTab({ tabId, ticketId, entry }) {
  await connectwiseTab(tabId);
  let time;
  try { time = await readTimeRowsInTab({ tabId, ticketId }); }
  catch (error) {
    if (/duplicate check is incomplete/.test(error.message)) throw error;
    const { frameId } = await matchingFrame(tabId, ticketId, inspectTicketFrame);
    await executeConnectWiseScript({
      target: { tabId, frameIds: [frameId] }, func: clickTicketTimeTab, args: [String(ticketId)]
    });
    for (let attempt = 0; attempt < 240; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      try { time = await readTimeRowsInTab({ tabId, ticketId }); break; }
      catch { /* Wait for Time list. */ }
    }
  }
  if (!time) throw new Error('The ticket Time list was not verified.');
  const [year, month, day] = entry.date.split('-');
  const date = `${Number(month)}/${Number(day)}/${year.slice(-2)}`;
  const toDisplay = (value) => {
    const [hour, minute] = value.split(':').map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  };
  const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  const matches = time.rows.filter((row) => row.date === date
    && row.start === toDisplay(entry.start) && row.end === toDisplay(entry.end)
    && normalize(row.notes) === normalize(entry.notes));
  if (matches.some((row) => !timeRowMatchesEntryFields(row, entry))) {
    throw new Error('An existing Time row has the same date, time, and Notes but different billing or work fields.');
  }
  return { ok: true, matches, total: time.rows.length };
}

function clickNewTimeEntry(ticketId) {
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-\s*([^\n]+)/)?.[0] || '';
  if (!new RegExp(`Service Ticket #${ticketId}(?!\\d)`).test(header)) {
    throw new Error('Ticket identity changed before New Time Entry.');
  }
  const buttons = [...document.querySelectorAll('.cw-toolbar-new-item.cw-toolbar-new-btn')]
    .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  if (buttons.length !== 1) throw new Error(`Expected one visible New Time Entry button, found ${buttons.length}.`);
  buttons[0].click();
  return { clicked: true };
}

async function openNewTimeEntryInTab({ tabId, ticketId }) {
  await connectwiseTab(tabId);
  let timeFrame;
  let ticketFrame;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { timeFrame = await matchingFrame(tabId, ticketId, inspectTimeRows); }
    catch { /* The Time list is not visible yet. */ }
    if (timeFrame) break;
    try { ticketFrame = await matchingFrame(tabId, ticketId, inspectTicketFrame); }
    catch { /* ConnectWise may be replacing its ticket frame. */ }
    if (ticketFrame) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!timeFrame && !ticketFrame) {
    throw new Error(`Ticket #${ticketId} Ticket and Time views were not visible after waiting for navigation.`);
  }
  if (ticketFrame) {
    await executeConnectWiseScript({
      target: { tabId, frameIds: [ticketFrame.frameId] }, func: clickTicketTimeTab, args: [String(ticketId)]
    });
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      try { timeFrame = await matchingFrame(tabId, ticketId, inspectTimeRows); break; }
      catch { /* Wait for the Time list. */ }
    }
  }
  if (!timeFrame) throw new Error(`Ticket #${ticketId} Time list did not open.`);
  await readTimeRowsInTab({ tabId, ticketId });
  const { frameId } = await matchingFrame(tabId, ticketId, inspectTimeRows);
  await executeConnectWiseScript({
    target: { tabId, frameIds: [frameId] }, func: clickNewTimeEntry, args: [String(ticketId)]
  });
  for (let attempt = 0; attempt < 240; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const frames = await executeConnectWiseScript({
      target: { tabId, allFrames: true }, func: detectTimeFrame, args: [String(ticketId)]
    });
    const matches = frames.filter((frame) => frame.result?.matches);
    if (matches.length === 1) return { ok: true, ticketId: Number(ticketId), frameId: matches[0].frameId };
    if (matches.length > 1) throw new Error('More than one New Time Entry form appeared.');
  }
  throw new Error('New Time Entry was clicked, but the form was not verified.');
}

function clickTicketTimeTab(ticketId) {
  const header = document.body?.innerText.match(/Service Ticket #(\d+)\s*-\s*([^\n]+)/)?.[0] || '';
  if (!new RegExp(`Service Ticket #${ticketId}(?!\\d)`).test(header)) throw new Error('Ticket changed before opening Time.');
  const tabs = [...document.querySelectorAll('span.GMDB3DUBOUI')].filter((el) =>
    el.getBoundingClientRect().width > 0 && /^Time\s*\d+$/i.test(el.textContent.trim()));
  if (tabs.length !== 1) throw new Error(`Expected one Time tab, found ${tabs.length}.`);
  tabs[0].click();
  return { clicked: true };
}

function inspectSavedTimeEntryFrame(ticketId, baselineTimeCount) {
  const visible = (el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const charge = [...document.querySelectorAll('input.cw_ChargeToTextBox')].filter(visible);
  const saved = /You have successfully updated this record/i.test(document.body?.innerText || '');
  const tabs = [...document.querySelectorAll('span.GMDB3DUBOUI')].filter((el) =>
    visible(el) && /^Time\s*\d+$/i.test(el.textContent.trim()));
  const timeCount = tabs.length === 1 ? Number(tabs[0].textContent.trim().match(/\d+$/)[0]) : null;
  const countIncreased = Number.isSafeInteger(baselineTimeCount) && timeCount > baselineTimeCount;
  const saveEvidence = Number.isSafeInteger(baselineTimeCount) ? countIncreased : saved;
  return { matches: saveEvidence && charge.length === 1
    && new RegExp(`(^|\\D)${ticketId}(\\D|$)`).test(charge[0].value) && tabs.length === 1,
  saved, countIncreased, timeCount, chargeCount: charge.length, timeTabCount: tabs.length };
}

function clickSavedEntryTimeTab(ticketId, baselineTimeCount) {
  const visible = (el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const charge = [...document.querySelectorAll('input.cw_ChargeToTextBox')].filter(visible);
  const tabs = [...document.querySelectorAll('span.GMDB3DUBOUI')].filter((el) =>
    visible(el) && /^Time\s*\d+$/i.test(el.textContent.trim()));
  const count = tabs.length === 1 ? Number(tabs[0].textContent.trim().match(/\d+$/)[0]) : null;
  const saved = /You have successfully updated this record/i.test(document.body?.innerText || '');
  const countIncreased = Number.isSafeInteger(baselineTimeCount) && count > baselineTimeCount;
  const saveEvidence = Number.isSafeInteger(baselineTimeCount) ? countIncreased : saved;
  if (charge.length !== 1 || tabs.length !== 1 || !new RegExp(`(^|\\D)${ticketId}(\\D|$)`).test(charge[0].value)
    || !saveEvidence) throw new Error('The saved Time Entry view was not verified.');
  tabs[0].click();
  return { clicked: true };
}

async function verifySavedTimeInTab({ tabId, ticketId, entry, baselineTimeCount }) {
  await connectwiseTab(tabId);
  const [year, month, day] = entry.date.split('-');
  const date = `${Number(month)}/${Number(day)}/${year.slice(-2)}`;
  const toDisplay = (value) => {
    const [hour, minute] = value.split(':').map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  };
  const normalized = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  let clickedTimeTab = false;
  let refreshed = false;
  let savedEntrySeen = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const { rows } = await readTimeRowsInTab({ tabId, ticketId });
      const matches = rows.filter((row) => row.date === date
        && row.start === toDisplay(entry.start) && row.end === toDisplay(entry.end)
        && normalized(row.notes) === normalized(entry.notes));
      if (matches.length > 1) throw new Error('Multiple matching saved time entries; stop for reconciliation.');
      if (matches.length === 1) {
        const row = matches[0];
        if (!timeRowMatchesEntryFields(row, entry)) {
          throw new Error('The matching saved Time row fields differ from the work record.');
        }
        if (!refreshed) {
          await chrome.tabs.reload(tabId);
          refreshed = true;
          clickedTimeTab = false;
          continue;
        }
        return { ok: true, verified: true, ticketId: Number(ticketId), row };
      }
    } catch (error) {
      if (/Multiple matching|saved Time row fields differ|duplicate check is incomplete/.test(error.message)) throw error;
      if (!clickedTimeTab) {
        try {
          const saved = await matchingFrame(tabId, ticketId, inspectSavedTimeEntryFrame, baselineTimeCount);
          await executeConnectWiseScript({
            target: { tabId, frameIds: [saved.frameId] }, func: clickSavedEntryTimeTab,
            args: [String(ticketId), baselineTimeCount]
          });
          savedEntrySeen = true;
          clickedTimeTab = true;
        } catch {
          try {
            const { frameId } = await matchingFrame(tabId, ticketId, inspectTicketFrame);
            await executeConnectWiseScript({
              target: { tabId, frameIds: [frameId] }, func: clickTicketTimeTab, args: [String(ticketId)]
            });
            clickedTimeTab = true;
          } catch { /* The page may be changing after Save & Return. */ }
        }
      }
    }
  }
  const finalFrames = await executeConnectWiseScript({
    target: { tabId, allFrames: true }, func: inspectSavedTimeEntryFrame,
    args: [String(ticketId), baselineTimeCount]
  }).catch(() => []);
  const form = finalFrames.map((frame) => frame.result).find((state) =>
    state?.chargeCount === 1 && state.timeTabCount === 1);
  if (Number.isSafeInteger(baselineTimeCount) && form?.timeCount === baselineTimeCount) {
    throw new Error(`Save & Return was activated, but the Time badge stayed at ${baselineTimeCount}. The entry is not verified as saved; inspect the still-open form for ConnectWise validation errors.`);
  }
  throw new Error(`Save & Return was activated, but the matching Time row was not verified.${savedEntrySeen ? ' A saved Time Entry screen was seen, but its Time list did not contain a verified match.' : ' No saved Time Entry screen was confirmed.'}`);
}

async function prepareTimeDraftInTab({ tabId, ticketId, entry }) {
  await connectwiseTab(tabId);
  if (!entry || typeof entry !== 'object') throw new Error('A time entry is required.');
  const frames = await executeConnectWiseScript({
    target: { tabId, allFrames: true }, func: detectTimeFrame, args: [String(ticketId)]
  });
  const matches = frames.filter((frame) => frame.result?.matches);
  if (matches.length !== 1) throw new Error(`Expected one blank time form for ticket #${ticketId}; found ${matches.length}.`);
  let frameId = matches[0].frameId;
  let notesReady = matches[0].result.signals?.notes === true;
  for (let attempt = 0; !notesReady && attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const states = await executeConnectWiseScript({ target: {tabId, allFrames:true}, func: detectTimeFrame, args:[String(ticketId)] });
    const current = states.filter((frame) => frame.result?.matches);
    if (current.length > 1) throw new Error('More than one matching Time Entry form appeared while waiting for Notes.');
    if (current.length === 1) {
      frameId = current[0].frameId;
      notesReady = current[0].result.signals?.notes === true;
    }
  }
  if (!notesReady) throw new Error('The time-entry form opened, but its Notes editor did not become ready within 60 seconds. Nothing was saved.');
  // Select Work Type with trusted browser input before filling times. A page
  // .click() can leave GWT's selection unchanged, especially for payroll types.
  await chooseTicketOptionInTab(tabId, frameId, 'input.cw_workType', entry.workType, ticketId);
  const [fill] = await executeConnectWiseScript({
    target: { tabId, frameIds: [frameId] }, func: fillTimeDraft,
    args: [{ ...entry, ticketId: String(ticketId) }]
  });
  if (!fill.result?.ok) throw new Error(fill.result?.error || 'Time form fill failed.');
  if (fill.result.warnings?.length) {
    throw new Error(`Time form choices need correction: ${fill.result.warnings.join(', ')}. Form remains unsaved.`);
  }
  const notes = await enterNotes({ tabId, frameId, ticketId: String(ticketId), notes: entry.notes });
  if (!notes.ok) throw new Error('Notes were not verified.');
  const [check] = await executeConnectWiseScript({
    target: { tabId, frameIds: [frameId] }, func: verifyCompleteTimeDraft,
    args: [String(ticketId), entry]
  });
  if (!check.result?.verified) throw new Error(check.result?.error || 'Time draft did not match the work record.');
  return { ok: true, ticketId: Number(ticketId), frameId, prepared: true, saved: false };
}

async function verifyPreparedTimeInTab({ tabId, ticketId, frameId, entry }) {
  await connectwiseTab(tabId);
  if (!Number.isInteger(frameId)) throw new Error('Prepared Time frame is missing.');
  const [check] = await executeConnectWiseScript({
    target: { tabId, frameIds: [frameId] }, func: verifyCompleteTimeDraft,
    args: [String(ticketId), entry]
  });
  return { ok: true, verified: check.result?.verified === true, error: check.result?.error || null };
}

function verifyCompleteTimeDraft(ticketId, entry) {
  const visible = (el) => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const one = (selector) => {
    const matches = [...document.querySelectorAll(selector)].filter(visible);
    if (matches.length !== 1) throw new Error(`${selector}: expected one visible control.`);
    return matches[0];
  };
  const combo = (value) => String(value || '').replace(/\s+/g, ' ').trim().replace(/^\$\s*/, '').toLowerCase();
  const display = (value) => {
    const [hour, minute] = value.split(':').map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  };
  try {
    if (!new RegExp(`(^|\\D)${ticketId}(\\D|$)`).test(one('input.cw_ChargeToTextBox').value)) {
      throw new Error('Charge To ticket changed.');
    }
    const [year, month, day] = entry.date.split('-');
    const expectedDate = `${month}/${day}/${year}`;
    const dateLabel = [...document.querySelectorAll('td,div,span,label')].find((el) =>
      el.children.length < 3 && /^Date\s*:?\s*\*?$/.test(el.textContent.trim()) && visible(el));
    const dateInputs = [...document.querySelectorAll('input[type="text"]')]
      .filter((el) => visible(el) && el.value?.includes(expectedDate));
    if (!dateLabel || dateInputs.length !== 1) throw new Error('Date differs or could not be verified.');
    if (combo(one('input.cw_ticketStatus').value) !== 'working issue now') throw new Error('Ticket is not Working Issue Now.');
    if (one('input.cw_startTime').value !== display(entry.start)
      || one('input.cw_endTime').value !== display(entry.end)) throw new Error('Time range differs.');
    if (combo(one('input.cw_workType').value) !== combo(entry.workType)
      || combo(one('input.cw_workRole').value) !== combo(entry.workRole)) throw new Error('Work Type or Role differs.');
    const billable = { B: 'Billable', NB: 'Do Not Bill', NC: 'No Charge' }[entry.billable];
    const actualBilling = combo(one('input.cw_billable').value);
    if (entry.billable === 'AUTO' ? !['billable', 'do not bill', 'no charge'].includes(actualBilling)
      : actualBilling !== combo(billable)) throw new Error('Billable choice differs or automatic value is unreadable.');
    for (const [selector, expected] of [
      ['input.cw_location', entry.location],
      ['input.cw_department', entry.businessUnit],
      ['input.cw_agreement', entry.agreement]
    ]) {
      if (expected && combo(one(selector).value) !== combo(expected)) throw new Error(`${selector} differs.`);
    }
    const [startHour, startMinute] = entry.start.split(':').map(Number);
    const [endHour, endMinute] = entry.end.split(':').map(Number);
    const expectedHours = Math.round((endHour * 60 + endMinute - startHour * 60 - startMinute) / 60 * 100) / 100;
    if (Math.abs(Number(one('input.cw_hours').value) - expectedHours) > 0.02) throw new Error('Actual Hours differs.');
    if (one('.public-DraftEditor-content[contenteditable="true"]').innerText.replace(/\r\n/g, '\n').trim()
      !== entry.notes.trim()) throw new Error('Notes differ.');
    const destinations = {
      Discussion: 'input.cw_isDiscussion', Internal: 'input.cw_isInternal', Resolution: 'input.cw_isResolution'
    };
    for (const [name, selector] of Object.entries(destinations)) {
      if (one(selector).checked !== (name === (entry.addNoteTo || 'Discussion'))) throw new Error('Note destination differs.');
    }
    for (const selector of ['input.cw_isToContact', 'input.cw_isToResources', 'input.cw_isToCcs']) {
      if (one(selector).checked) throw new Error('An email recipient remains selected.');
    }
    return { verified: true };
  } catch (error) { return { verified: false, error: error.message }; }
}

function locateTimeSaveButton() {
  const visible = (el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const exact = [...document.querySelectorAll('.cw_ToolbarButton_SaveAndReturn')];
  const target = (el) => visible(el) ? el : [...el.querySelectorAll('*')].find(visible);
  const exactButtons = exact.map(target).filter(Boolean);
  const labeled = [...document.querySelectorAll('[title="Save & Return"], [aria-label="Save & Return"]')];
  const labeledButtons = labeled.map(target).filter(Boolean);
  const textButtons = [...document.querySelectorAll('button, a, div, span')]
    .filter((el) => visible(el) && el.textContent.trim() === 'Save & Return'
      && ![...el.children].some((child) => visible(child)
        && child.textContent.trim() === 'Save & Return'));
  let buttons = exactButtons.length ? exactButtons
    : labeledButtons.length ? labeledButtons : textButtons;
  let method = exactButtons.length ? 'class' : labeledButtons.length ? 'label' : 'text';
  let saveAnchors = 0;
  let adjacent = 0;
  if (!buttons.length) {
    const classAnchors = [...document.querySelectorAll('.cw_ToolbarButton_Save')].filter(visible);
    const anchors = classAnchors.length ? classAnchors
      : [...document.querySelectorAll('[title="Save"], [aria-label="Save"]')].filter(visible);
    saveAnchors = anchors.length;
    if (anchors.length === 1 && anchors[0].parentElement) {
      const save = anchors[0].getBoundingClientRect();
      const saveX = save.left + save.width / 2;
      const saveY = save.top + save.height / 2;
      const siblings = [...anchors[0].parentElement.children].filter((el) => el !== anchors[0] && visible(el));
      const candidates = siblings.filter((el) => {
        const rect = el.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - saveX;
        const dy = Math.abs(rect.top + rect.height / 2 - saveY);
        const toolbarAction = /cw_ToolbarButton_/.test(String(el.className || ''))
          || Boolean(el.querySelector('.mm_button'));
        return dx >= 20 && dx <= 55 && dy <= 12 && rect.width <= 55
          && rect.height <= 45 && toolbarAction;
      });
      adjacent = candidates.length;
      if (candidates.length === 1) { buttons = candidates; method = 'adjacent-to-save'; }
    }
  }
  if (buttons.length !== 1) return { found: false, count: buttons.length,
    candidates: exact.length + labeled.length + textButtons.length, saveAnchors, adjacent };
  buttons[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const rect = buttons[0].getBoundingClientRect();
  let x = rect.left + rect.width / 2;
  let y = rect.top + rect.height / 2;
  let view = window;
  while (view !== view.top) {
    const frame = view.frameElement;
    if (!frame) throw new Error('The Save & Return frame position could not be mapped.');
    const bounds = frame.getBoundingClientRect();
    x = bounds.left + frame.clientLeft + x;
    y = bounds.top + frame.clientTop + y;
    view = view.parent;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)
    || x < 0 || y < 0 || x >= view.innerWidth || y >= view.innerHeight) {
    return { found: false, count: buttons.length,
      candidates: exact.length + labeled.length + textButtons.length,
      reason: 'outside the visible browser area' };
  }
  return { found: true, x, y, method };
}

async function trustedTimeSave(tabId, frameId, ticketId) {
  await chrome.tabs.update(tabId, { active: true });
  const located = await executeConnectWiseScript({
    target: { tabId, allFrames: true }, func: locateTimeSaveButton
  });
  const points = located.filter((frame) => frame.result?.found
    && Number.isFinite(frame.result.x) && Number.isFinite(frame.result.y));
  if (points.length !== 1) {
    const detail = located.map((frame) => `frame ${frame.frameId}: ${frame.result?.reason
      || `${frame.result?.count ?? 0} visible buttons, ${frame.result?.candidates ?? 0} direct candidates, ${frame.result?.saveAnchors ?? 0} Save anchors, ${frame.result?.adjacent ?? 0} adjacent actions`}`).join('; ');
    throw new Error(`Expected one visible Save & Return click target, found ${points.length}.${detail ? ` ${detail}` : ''}`);
  }
  await browserMouse(tabId, points[0].result, false);
}

async function savePreparedTimeInTab({ tabId, ticketId, frameId, entry, baselineTimeCount }) {
  await connectwiseTab(tabId);
  if (!Number.isInteger(frameId)) throw new Error('The prepared time frame is required.');
  const target = { tabId, frameIds: [frameId] };
  const [before] = await executeConnectWiseScript({
    target, func: verifyCompleteTimeDraft, args: [String(ticketId), entry]
  });
  if (!before.result?.verified) throw new Error(before.result?.error || 'The time draft changed before save.');
  await trustedTimeSave(tabId, frameId, ticketId);
  const saved = await verifySavedTimeInTab({ tabId, ticketId, entry, baselineTimeCount });
  return { ...saved, saveClicked: true };
}

async function enterNotes({ tabId, frameId, ticketId, notes }) {
  if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || !/^\d+$/.test(ticketId)
    || typeof notes !== 'string' || !notes.trim()) {
    throw new Error('Invalid ticket or Notes input.');
  }
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith('https://na.myconnectwise.net/')) {
    throw new Error('The active tab is not ConnectWise.');
  }
  const target = { tabId };
  let attached = false;
  let foreignLease = null;
  try {
    foreignLease = await attachConnectWiseDebugger(target);
    attached = true;
    const [focus] = await executeConnectWiseScript({
      target: { tabId, frameIds: [frameId] },
      func: focusBlankNotes,
      args: [ticketId]
    });
    if (!focus?.result?.ok) throw new Error(focus?.result?.error || 'The Notes editor could not be focused.');
    await chrome.debugger.sendCommand(target, 'Input.insertText', { text: notes });
    await new Promise((resolve) => setTimeout(resolve, 350));
    const [verification] = await executeConnectWiseScript({
      target: { tabId, frameIds: [frameId] },
      func: verifyNotes,
      args: [ticketId, notes]
    });
    if (!verification?.result?.ok) throw new Error(verification?.result?.error || 'ConnectWise did not retain the Notes text.');
    return { ok: true };
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
    if (foreignLease) await restoreForeignExtensionFrames(target.tabId, foreignLease);
  }
}

function focusBlankNotes(ticketId) {
  const charge = [...document.querySelectorAll('input.cw_ChargeToTextBox')]
    .filter((input) => input.getBoundingClientRect().width > 0);
  if (charge.length !== 1 || !new RegExp(`(^|\\D)${ticketId}(\\D|$)`).test(charge[0].value)) {
    return { ok: false, error: 'Ticket changed before Notes entry.' };
  }
  const editors = [...document.querySelectorAll('.public-DraftEditor-content[contenteditable="true"]')]
    .filter((editor) => editor.getBoundingClientRect().width > 0);
  if (editors.length !== 1) return { ok: false, error: 'The Notes editor is missing or collapsed.' };
  const editor = editors[0];
  if (editor.textContent.trim()) return { ok: false, error: 'Notes already contains text.' };
  editor.focus();
  if (document.activeElement !== editor || !editor.isConnected || !editor.getBoundingClientRect().width) {
    return { ok: false, error: 'The Notes editor lost focus or collapsed.' };
  }
  return { ok: true };
}

function verifyNotes(ticketId, notes) {
  const charge = [...document.querySelectorAll('input.cw_ChargeToTextBox')]
    .filter((input) => input.getBoundingClientRect().width > 0);
  if (charge.length !== 1 || !new RegExp(`(^|\\D)${ticketId}(\\D|$)`).test(charge[0].value)) {
    return { ok: false, error: 'Ticket changed during Notes entry.' };
  }
  const editors = [...document.querySelectorAll('.public-DraftEditor-content[contenteditable="true"]')]
    .filter((editor) => editor.getBoundingClientRect().width > 0);
  if (editors.length !== 1) return { ok: false, error: 'The Notes editor disappeared.' };
  const actual = editors[0].innerText.replace(/\r\n/g, '\n').trim();
  if (actual !== notes.trim()) return { ok: false, error: 'The Notes editor did not retain the exact text.' };
  return { ok: true };
}







































