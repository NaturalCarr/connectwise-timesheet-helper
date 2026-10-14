const status = document.getElementById('status');
const result = document.getElementById('result');
const copy = document.getElementById('copy');
document.getElementById('open-eod').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('eod.html'), active: true });
});
chrome.runtime.sendMessage({ action: 'helperBuild' }).then((build) => {
  document.getElementById('helper-build').textContent = build?.version
    ? `Loaded helper ${build.version} · Ticket Save: ${build.ticketSaveMethod}`
    : 'Reload the extension: its background worker did not report a version.';
}).catch(() => {
  document.getElementById('helper-build').textContent = 'Reload the extension to refresh its background worker.';
});

document.addEventListener('popup-drafts-cleared', () => { status.textContent = ''; });

function readTimeEntry() {
  return {
    date: document.getElementById('date').value,
    start: document.getElementById('start').value,
    end: document.getElementById('end').value,
    workType: document.getElementById('work-type').value.trim(),
    workRole: document.getElementById('work-role').value.trim(),
    billable: document.getElementById('billable').value,
    notes: document.getElementById('notes').value.trim()
  };
}

document.getElementById('save-current-time').addEventListener('click', async () => {
  const form = document.getElementById('draft-form');
  if (!form.reportValidity()) return;
  const button = document.getElementById('save-current-time');
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://na.myconnectwise.net/')) {
      throw new Error('Open the intended ConnectWise ticket in this Brave window first.');
    }
    const jobId = crypto.randomUUID();
    const key = `currentTimeJob:${jobId}`;
    await chrome.storage.session.set({ [key]: {
      tabId: tab.id, entry: readTimeEntry(),
      completeAfterTime: document.getElementById('current-time-complete').checked
    } });
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL(`current-time-runner.html#${jobId}`), active: true });
    } catch (error) {
      await chrome.storage.session.remove(key);
      throw error;
    }
    status.textContent = 'Time runner opened. It will report the saved Time row or why it stopped.';
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});

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

document.getElementById('draft-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const entry = readTimeEntry();
  const [startHour, startMinute] = entry.start.split(':').map(Number);
  const [endHour, endMinute] = entry.end.split(':').map(Number);
  if (endHour * 60 + endMinute <= startHour * 60 + startMinute) {
    status.textContent = 'End must be after start on the same date.';
    return;
  }
  status.textContent = 'Preparing the unsaved time form...';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('https://na.myconnectwise.net/')) {
      throw new Error('Open a blank ConnectWise New Time Entry in this Brave window.');
    }
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: detectTimeFrame
    });
    const matchingFrames = frames.filter((frame) => frame.result?.matches);
    if (matchingFrames.length !== 1) {
      const forms = frames.filter((frame) => frame.result?.isTimeForm).length;
      const signals = ['charge', 'start', 'end', 'notes'].map((name) =>
        `${name} ${frames.filter((frame) => frame.result?.signals?.[name]).length}`).join(', ');
      throw new Error(forms === 0
        ? `No New Time Entry form was found in ${frames.length} frames (${signals}). Use Save time on current ticket from the saved ticket's Ticket or Time tab.`
        : forms === 1 && matchingFrames.length === 0
          ? 'The ticket number could not be read from the open Time Entry Charge To field.'
          : 'More than one matching Time Entry form is open; close the extras and retry.');
    }
    entry.ticketId = matchingFrames[0].result.ticketId;
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [matchingFrames[0].frameId] },
      func: fillTimeDraft,
      args: [entry]
    });
    const outcome = execution.result;
    if (!outcome?.ok) throw new Error(outcome?.error || 'Draft preparation failed.');
    const noteResult = await chrome.runtime.sendMessage({
      action: 'enterNotes',
      tabId: tab.id,
      frameId: matchingFrames[0].frameId,
      ticketId: entry.ticketId,
      notes: entry.notes
    });
    if (!noteResult?.ok) throw new Error(`Time fields were prepared, but Notes failed: ${noteResult?.error || 'unknown error'}. Leave this form unsaved until the Notes field is correct.`);
    const warnings = outcome.warnings.length ? ` Check manually: ${outcome.warnings.join(', ')}.` : '';
    status.textContent = `Draft prepared on ticket #${entry.ticketId}, including verified Notes. Review the ConnectWise form before Save & Return.${warnings}`;
  } catch (error) {
    status.textContent = error.message;
  }
});

document.getElementById('copy-notes').addEventListener('click', async () => {
  const notes = document.getElementById('notes').value;
  if (!notes.trim()) {
    status.textContent = 'Enter notes in the popup first.';
    return;
  }
  await navigator.clipboard.writeText(notes);
  status.textContent = 'Notes copied. Expand Notes in ConnectWise and press Ctrl+V.';
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


