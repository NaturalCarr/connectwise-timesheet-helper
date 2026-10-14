const popupDraftGroups = {
  ticket: ['ticket-title-contains', 'ticket-school', 'ticket-existing-id', 'ticket-issue', 'ticket-description',
    'ticket-with-time', 'ticket-time-date', 'ticket-time-billable', 'ticket-time-start',
    'ticket-time-end', 'ticket-time-work-type', 'ticket-time-work-role', 'ticket-time-notes',
    'ticket-complete-after-time', 'ticket-json'],
  week: ['week-json'],
  time: ['date', 'billable', 'start', 'end', 'work-type', 'work-role', 'notes',
    'current-time-complete']
};
const popupDraftQueue = { ticket: Promise.resolve(), week: Promise.resolve(), time: Promise.resolve() };
const popupDraftKey = (group) => `popupDraft:${group}`;
let popupDraftMutating = false;

function savePopupDraft(group) {
  const values = {};
  for (const id of popupDraftGroups[group]) {
    const input = document.getElementById(id);
    values[id] = input.type === 'checkbox' ? input.checked : input.value;
  }
  popupDraftQueue[group] = popupDraftQueue[group].catch(() => {}).then(() =>
    chrome.storage.local.set({ [popupDraftKey(group)]: values }));
  return popupDraftQueue[group];
}

async function clearPopupDrafts() {
  await Promise.all(Object.values(popupDraftQueue).map((queue) => queue.catch(() => {})));
  popupDraftMutating = true;
  await chrome.storage.local.remove(Object.keys(popupDraftGroups).map(popupDraftKey));
  document.getElementById('ticket-form').reset();
  document.getElementById('draft-form').reset();
  for (const id of ['ticket-json', 'week-json', 'ticket-file', 'week-file']) {
    document.getElementById(id).value = '';
  }
  document.getElementById('ticket-with-time').dispatchEvent(new Event('change', { bubbles: true }));
  document.dispatchEvent(new Event('popup-drafts-cleared'));
  popupDraftMutating = false;
}

window.popupDraft = { save: savePopupDraft };

document.addEventListener('input', (event) => {
  if (popupDraftMutating) return;
  const group = Object.keys(popupDraftGroups).find((name) =>
    popupDraftGroups[name].includes(event.target?.id));
  if (group) void savePopupDraft(group);
});
document.addEventListener('change', (event) => {
  if (popupDraftMutating) return;
  const group = Object.keys(popupDraftGroups).find((name) =>
    popupDraftGroups[name].includes(event.target?.id));
  if (group) void savePopupDraft(group);
});

for (const [fileId, textId, group] of [
  ['ticket-file', 'ticket-json', 'ticket'], ['week-file', 'week-json', 'week']
]) {
  document.getElementById(fileId).addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file || file.size > 1024 * 1024) return;
    const text = document.getElementById(textId);
    text.value = await file.text();
    text.dispatchEvent(new Event('input', { bubbles: true }));
    void savePopupDraft(group);
  });
}

document.getElementById('clear-saved-inputs').addEventListener('click', () => {
  void clearPopupDrafts();
});

document.addEventListener('DOMContentLoaded', async () => {
  const keys = Object.keys(popupDraftGroups).map(popupDraftKey);
  const saved = await chrome.storage.local.get(keys);
  popupDraftMutating = true;
  for (const [group, ids] of Object.entries(popupDraftGroups)) {
    const values = saved[popupDraftKey(group)];
    if (!values || typeof values !== 'object') continue;
    for (const id of ids) {
      const input = document.getElementById(id);
      if (input.type === 'checkbox') input.checked = values[id] === true;
      else if (typeof values[id] === 'string') input.value = values[id];
    }
  }
  document.getElementById('ticket-with-time').dispatchEvent(new Event('change', { bubbles: true }));
  document.dispatchEvent(new Event('popup-drafts-restored'));
  popupDraftMutating = false;
});

