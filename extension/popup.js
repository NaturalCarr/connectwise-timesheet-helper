const status = document.getElementById('status');
const result = document.getElementById('result');
const copy = document.getElementById('copy');
document.getElementById('open-eod').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('eod.html'), active: true });
});
chrome.runtime.sendMessage({ action: 'helperBuild' }).then((build) => {
  document.getElementById('helper-build').textContent = build?.version
    ? `Version ${build.version}`
    : 'Reload the extension: its background worker did not report a version.';
}).catch(() => {
  document.getElementById('helper-build').textContent = 'Reload the extension to refresh its background worker.';
});

document.addEventListener('popup-drafts-cleared', () => { status.textContent = ''; });

document.getElementById('select-tab').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://na.myconnectwise.net/')) {
      throw new Error('Open the intended signed-in ConnectWise tab first.');
    }
    await chrome.storage.local.set({ connectwiseTabId: tab.id });
    status.textContent = `Browser runs will use ConnectWise tab ${tab.id}.`;
  } catch (error) { status.textContent = error.message; }
});

document.getElementById('inspect').addEventListener('click', async () => {
  status.textContent = 'Reading visible form controls...';
  result.value = '';
  copy.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://na.myconnectwise.net/')) {
      throw new Error('Open ConnectWise PSA in this Brave window first.');
    }
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: inspectForm
    });
    result.value = JSON.stringify(frames.map(({ frameId, result }) => ({ frameId, ...result })), null, 2);
    copy.disabled = false;
    status.textContent = `Read ${frames.length} frame(s). No form values were copied.`;
  } catch (error) {
    status.textContent = error.message;
  }
});

copy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(result.value);
  status.textContent = 'Inspection copied. Paste it into this chat.';
});

function inspectForm() {
  const labels = [
    'Summary', 'Company', 'Site', 'Contact', 'Board', 'Status', 'Type', 'Subtype',
    'Ticket Owner', 'Agreement', 'Initial Description', 'Date', 'Work Role',
    'Location', 'Business Unit', 'Ticket Status', 'Start Time', 'End Time',
    'Deduct', 'Actual Hrs', 'Work Type', 'Billable', 'Notes', 'Resources', 'Cc'
  ];
  const normalize = (text) => (text || '').replace(/\s+/g, ' ').replace(/[:*]+$/, '').trim().toLowerCase();
  const controls = 'input, select, textarea, [contenteditable="true"], [role="combobox"], [role="checkbox"]';
  const visible = (el) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const elements = [...document.querySelectorAll('label, span, div, td')].filter((el) => {
    const ownText = [...el.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent).join('');
    return labels.some((label) => normalize(ownText) === label.toLowerCase()) && visible(el);
  });
  const describe = (el) => el && ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type'),
    id: el.id || null,
    name: el.getAttribute('name'),
    role: el.getAttribute('role'),
    ariaLabel: el.getAttribute('aria-label'),
    placeholder: el.getAttribute('placeholder'),
    className: typeof el.className === 'string' ? el.className.slice(0, 120) : null
  });
  const findings = elements.map((label) => {
    const text = normalize(label.textContent);
    const direct = label.matches('label') && label.htmlFor ? document.getElementById(label.htmlFor) : null;
    const nearby = direct || label.parentElement?.querySelector(controls)
      || label.nextElementSibling?.matches(controls) && label.nextElementSibling
      || label.parentElement?.nextElementSibling?.querySelector(controls);
    return { label: text, labelElement: describe(label), control: describe(nearby) };
  });
  const unique = [...new Map(findings.map((finding) => [
    `${finding.label}|${finding.control?.id || finding.control?.className || ''}`,
    finding
  ])).values()];
  const namedControls = [...document.querySelectorAll(controls)]
    .filter((el) => visible(el) && /\bcw[_-]/i.test(typeof el.className === 'string' ? el.className : ''))
    .map(describe);
  const unmappedControls = [...document.querySelectorAll('input, textarea, [contenteditable="true"], iframe')]
    .filter((el) => visible(el) && !/\bcw[_-]/i.test(typeof el.className === 'string' ? el.className : ''))
    .slice(0, 80)
    .map((el) => {
      const box = el.getBoundingClientRect();
      return {
        control: describe(el),
        parent: describe(el.parentElement),
        position: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
      };
    });
  const buttons = [...document.querySelectorAll('button, [role="button"], a')]
    .filter(visible)
    .map((el) => ({ text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60), control: describe(el) }))
    .filter((item) => item.text && /save|return|new|add|time/i.test(item.text))
    .slice(0, 30);
  const actionLabels = [...document.querySelectorAll('div, span, td')]
    .filter((el) => visible(el) && /^(save( & return)?|new|add another time entry)$/i.test((el.textContent || '').trim()))
    .filter((el) => el.children.length < 2)
    .slice(0, 25)
    .map((el) => ({ text: (el.textContent || '').trim(), element: describe(el), parent: describe(el.parentElement) }));
  return {
    page: { origin: location.origin, path: location.pathname, title: document.title },
    findings: unique,
    namedControls,
    unmappedControls,
    buttons,
    actionLabels,
    editableBody: document.body ? { designMode: document.designMode, contentEditable: document.body.contentEditable, className: document.body.className } : null
  };
}




