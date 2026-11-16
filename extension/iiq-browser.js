// IIQ is read-only here: search input, search result navigation, and rendered status text.
function inspectIiqTicket(reference) {
 const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
 const headings = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(visible);
 const refs = headings.map(el => {
  const label = el.getAttribute('aria-label') || '';
  const full = label.match(/Ticket\s*#?\s*T\s*-\s*(\d+)/i) || el.innerText.match(/Ticket\s*#?\s*T\s*-\s*(\d+)/i);
  const badge = el.querySelector('[data-testid="ticket-number"]')?.textContent.trim().match(/^T\s*-\s*(\d+)$/i);
  return full?.[1] || badge?.[1];
 }).filter(Boolean);
 const statuses = [...document.querySelectorAll('a[ng-bind="$ctrl.GetTicketStatusText()"]')].filter(visible);
 if (refs.length !== 1 || `T-${refs[0]}` !== reference || statuses.length !== 1 || !statuses[0].innerText.trim()) return { verified: false };
 return { verified: true, reference, status: statuses[0].innerText.trim(), url: location.href, observedAt: new Date().toISOString() };
}
function prepareIiqSearch() {
 const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
 const input = document.getElementById('global-search-input');
 if (visible(input)) { input.focus(); input.select(); return { ready: true }; }
 const buttons = [...document.querySelectorAll('[data-testid="btn-global-search"]')].filter(visible);
 if (buttons.length !== 1) return { ready: false };
 buttons[0].click(); return { ready: false };
}
function inspectIiqSearch(reference) {
 const input = document.getElementById('global-search-input');
 if (!input || input.value !== reference) return { verified: false };
 const visible = el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
 const links = [...document.querySelectorAll('a')].filter(visible).filter(link => {
  const kind = link.querySelector('[data-testid="label-entity-type"]');
  const label = link.querySelector('[data-testid="label-primary"]');
  if (kind?.textContent.trim() !== 'Ticket' || !label) return false;
  const match = label.textContent.match(/#?\s*T\s*-\s*(\d+)\b/i);
  return match && `T-${match[1]}` === reference;
 });
 const urls = [...new Set(links.map(link => link.href))];
 if (urls.length > 1) throw new Error('IIQ search returned multiple exact ticket links.');
 if (!urls.length) return { verified: false };
 const url = new URL(urls[0]);
 if (url.origin !== location.origin || !/^\/agent\/tickets\/[0-9a-f-]{36}$/i.test(url.pathname)) throw new Error('IIQ ticket link was not a same-site ticket detail link.');
 return { verified: true, url: url.href };
}
async function readIiqStatusInTab({ tabId, reference }) {
 if (!/^T-\d+$/.test(reference || '')) throw new Error('An exact IIQ reference is required.');
 const tab = await chrome.tabs.get(tabId);
 const origin = new URL(tab.url || '').origin;
 if (!/^https:\/\/[a-z0-9-]+\.incidentiq\.com$/i.test(origin)) throw new Error('Choose a signed-in IIQ tab.');
 const target = { tabId };
 const run = async (func, args = []) => {
  const current = await chrome.tabs.get(tabId);
  if (new URL(current.url || '').origin !== origin) throw new Error('IIQ tab navigated away or needs sign-in.');
  const [result] = await chrome.scripting.executeScript({ target, func, args });
  return result?.result;
 };
 // Always use a fresh search, including when this ticket was read during preview.
 await chrome.tabs.update(tabId, { active: true });
 let ready = false;
 for (let attempt = 0; attempt < 40; attempt++) {
  if ((await run(prepareIiqSearch))?.ready) { ready = true; break; }
  await new Promise(resolve => setTimeout(resolve, 250));
 }
 if (!ready) throw new Error('IIQ global search was not available. Open a signed-in ticketing page.');
 let attached = false;
 try {
  await chrome.debugger.attach(target, '1.3'); attached = true;
  if (!(await run(prepareIiqSearch))?.ready) throw new Error('IIQ search focus was lost.');
  await chrome.debugger.sendCommand(target, 'Input.insertText', { text: reference });
  await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
 } finally { if (attached) await chrome.debugger.detach(target).catch(() => {}); }
 let match;
 for (let attempt = 0; attempt < 120; attempt++) {
  match = await run(inspectIiqSearch, [reference]);
  if (match?.verified) break;
  await new Promise(resolve => setTimeout(resolve, 250));
 }
 if (!match?.verified) throw new Error('An exact IIQ search result was not verified. No CW update was attempted.');
 await chrome.tabs.update(tabId, { url: match.url, active: true });
 let stable = 0, status = '', state;
 for (let attempt = 0; attempt < 120; attempt++) {
  try { state = await run(inspectIiqTicket, [reference]); } catch (error) {
   if (/navigated away|sign-in/.test(error.message)) throw error;
   state = null;
  }
  stable = state?.verified && state.status === status ? stable + 1 : 0;
  if (state?.verified) status = state.status;
  if (stable >= 3) return { ok: true, ...state };
  await new Promise(resolve => setTimeout(resolve, 500));
 }
 throw new Error('IIQ ticket identity and current status were not verified. No CW update was attempted.');
}
