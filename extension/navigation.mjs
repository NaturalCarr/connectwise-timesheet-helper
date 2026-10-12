export async function chooseConnectWiseTab(params) {
  const configured = Number(params.get('tabId'));
  if (Number.isSafeInteger(configured) && configured > 0) {
    const tab = await chrome.tabs.get(configured);
    if (!tab.url?.startsWith('https://na.myconnectwise.net/')) throw new Error('Configured tab is not ConnectWise.');
    return configured;
  }
  const saved = (await chrome.storage.local.get('connectwiseTabId')).connectwiseTabId;
  if (Number.isSafeInteger(saved)) {
    try {
      const tab = await chrome.tabs.get(saved);
      if (tab.url?.startsWith('https://na.myconnectwise.net/')) return saved;
    } catch { /* The saved tab was closed. */ }
  }
  const tabs = await chrome.tabs.query({ url: 'https://na.myconnectwise.net/*' });
  if (tabs.length !== 1) {
    throw new Error(`Found ${tabs.length} ConnectWise tabs. Select one with the extension popup before running.`);
  }
  return tabs[0].id;
}

export async function mainWorkspaceTab(tabId, reportStatus = () => {}) {
  const selected = await chrome.tabs.get(tabId);
  const selectedUrl = new URL(selected.url);
  if (selectedUrl.pathname.toLowerCase().endsWith('/connectwise.aspx')
    && selectedUrl.searchParams.get('fullscreen') !== 'true') return tabId;
  reportStatus('Opening the main ConnectWise app for Service Board navigation…');
  const created = await chrome.tabs.create({
    url: 'https://na.myconnectwise.net/v2025_1/ConnectWise.aspx?locale=en_US', active: true
  });
  if (!created?.id) throw new Error('A main ConnectWise tab could not be opened.');
  for (let attempt = 0; attempt < 80; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const tab = await chrome.tabs.get(created.id);
    if (tab.status !== 'complete') continue;
    if (!tab.url?.startsWith('https://na.myconnectwise.net/')) {
      throw new Error('The main ConnectWise tab navigated outside ConnectWise.');
    }
    try {
      const [frame] = await chrome.scripting.executeScript({ target: { tabId: created.id },
        func: () => ({ shellReady: [...document.querySelectorAll('.cw-lcm-section')]
          .some((section) => section.innerText.trim() === 'Service Desk') }) });
      if (frame?.result?.shellReady) return created.id;
    } catch { /* The app may still be rendering after the tab reports complete. */ }
  }
  throw new Error('The main ConnectWise navigation did not load in the new tab.');
}
