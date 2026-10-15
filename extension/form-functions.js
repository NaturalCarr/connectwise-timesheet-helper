function detectTimeFrame(ticketId) {
  const chargeTo = [...document.querySelectorAll('input.cw_ChargeToTextBox')].filter((input) => {
    const box = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  });
  const signals = {
    charge: chargeTo.length === 1,
    start: Boolean(document.querySelector('input.cw_startTime')),
    end: Boolean(document.querySelector('input.cw_endTime')),
    notes: Boolean(document.querySelector('.public-DraftEditor-content[contenteditable="true"]'))
  };
  const isTimeForm = signals.charge && signals.start && signals.end;
  const ids = isTimeForm
    ? [...String(chargeTo[0].value || '').matchAll(/(?:^|\/)\s*(\d+)\s*-/g)].map((match) => match[1]) : [];
  const detectedTicketId = ids.length === 1 ? ids[0] : null;
  const matches = isTimeForm && detectedTicketId !== null
    && (ticketId == null || detectedTicketId === String(ticketId));
  return { isTimeForm, matches, signals, ticketId: detectedTicketId };
}


async function fillTimeDraft(entry) {
  const warnings = [];
  const visible = (el) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const one = (selector, name) => {
    const matches = [...document.querySelectorAll(selector)].filter(visible);
    if (matches.length !== 1) throw new Error(`${name}: expected one visible control, found ${matches.length}.`);
    return matches[0];
  };
  const chargeTo = one('input.cw_ChargeToTextBox', 'Charge To');
  if (!new RegExp(`(^|\\D)${entry.ticketId}(\\D|$)`).test(chargeTo.value)) {
    return { ok: false, error: `Open a New Time Entry on ticket #${entry.ticketId} first.` };
  }
  const end = one('input.cw_endTime', 'End Time');
  const editor = one('.public-DraftEditor-content[contenteditable="true"]', 'Notes');
  if (end.value.trim() || editor.textContent.trim()) {
    return { ok: false, error: 'This time form already has an end time or notes. Open a blank New Time Entry.' };
  }
  if (!one('input.cw_isEnteringTime', 'Enter Time Record').checked) {
    return { ok: false, error: 'Enter Time Record is not checked.' };
  }
  const currentTicketStatus = one('input.cw_ticketStatus', 'Ticket Status').value.trim();
  if (currentTicketStatus.toLowerCase() !== 'working issue now') {
    return { ok: false, error: `Ticket Status is ${currentTicketStatus || '(blank)'}. Set and save the ticket as Working Issue Now before entering time.` };
  }

  const setText = (input, value) => {
    input.focus();
    input.select();
    const inserted = document.execCommand('insertText', false, value);
    if (!inserted || input.value !== value) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
  };
  const toDisplayTime = (value) => {
    const [hour, minute] = value.split(':').map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  };
  const toMinutes = (value) => {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;
    return (Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2]);
  };
  const findDateInput = () => {
    const labels = [...document.querySelectorAll('td, div, span, label')].filter((el) => {
      const text = [...el.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent).join('').replace(/[:*\s]/g, '').toLowerCase();
      return text === 'date' && visible(el);
    });
    const inputs = [...document.querySelectorAll('input[type="text"]')]
      .filter((el) => visible(el) && !/\bcw[_-]/i.test(el.className));
    const choices = labels.flatMap((label) => inputs.map((input) => {
      const a = label.getBoundingClientRect();
      const b = input.getBoundingClientRect();
      const vertical = Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
      return { input, score: vertical + Math.max(0, a.right - b.left), vertical };
    })).filter((choice) => choice.vertical < 25).sort((a, b) => a.score - b.score);
    if (!choices.length) throw new Error('Date input was not found.');
    return choices[0].input;
  };

  try {
    const dateInput = findDateInput();
    const [year, month, day] = entry.date.split('-');
    const dateText = `${month}/${day}/${year}`;
    setText(dateInput, dateText);
    if (!dateInput.value.includes(dateText)) warnings.push('Date');

    setText(one('input.cw_startTime', 'Start Time'), toDisplayTime(entry.start));
    setText(one('input.cw_endTime', 'End Time'), toDisplayTime(entry.end));
    const [startHour, startMinute] = entry.start.split(':').map(Number);
    const [endHour, endMinute] = entry.end.split(':').map(Number);
    if (toMinutes(one('input.cw_startTime', 'Start Time').value) !== startHour * 60 + startMinute) warnings.push('Start Time');
    if (toMinutes(one('input.cw_endTime', 'End Time').value) !== endHour * 60 + endMinute) warnings.push('End Time');

    const expected = {
      'Work Type': [one('input.cw_workType', 'Work Type'), entry.workType],
      'Work Role': [one('input.cw_workRole', 'Work Role'), entry.workRole],
      Billable: [one('input.cw_billable', 'Billable'), { B: 'Billable', NB: 'Do Not Bill', NC: 'No Charge' }[entry.billable]]
    };
    if (entry.billable === 'AUTO') delete expected.Billable;
    for (const [label, selector, value] of [
      ['Location', 'input.cw_location', entry.location],
      ['Business Unit', 'input.cw_department', entry.businessUnit],
      ['Agreement', 'input.cw_agreement', entry.agreement]
    ]) {
      if (value) expected[label] = [one(selector, label), value];
    }
    const normalizeCombo = (value) => String(value || '').replace(/\s+/g, ' ').trim().replace(/^\$\s*/, '').replace(/~$/, '').trim().toLowerCase();
    const chooseCombo = async (label, input, value) => {
      if (normalizeCombo(input.value) === normalizeCombo(value)) return;
      const arrow = input.nextElementSibling?.tagName === 'DIV'
        ? input.nextElementSibling : input.parentElement?.querySelector('input + div');
      if (!arrow || !visible(arrow)) throw new Error(`${label}: dropdown arrow was not found.`);
      const readOptions = () => [...document.querySelectorAll('.gwt-dropdown-options .mm_label, .gwt-dropdown-options [role="option"]')]
        .filter(visible);
      if (!readOptions().some((option) => normalizeCombo(option.textContent) === normalizeCombo(value))) arrow.click();
      let options = [];
      let matches = [];
      for (let attempt = 0; attempt < 80; attempt++) {
        options = readOptions();
        matches = options.filter((option) => normalizeCombo(option.textContent) === normalizeCombo(value));
        if (matches.length) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (matches.length !== 1) throw new Error(`${label}: expected one ${value} choice, found ${matches.length}. Visible options: ${options.map((option) => option.textContent.trim()).slice(0, 25).join(' | ') || 'none'}.`);
      matches[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      matches[0].click();
      for (let attempt = 0; attempt < 30 && normalizeCombo(input.value) !== normalizeCombo(value); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (normalizeCombo(input.value) !== normalizeCombo(value)) {
        throw new Error(`${label}: selection did not take effect.`);
      }
    };
    for (const [label, [input, value]] of Object.entries(expected)) {
      await chooseCombo(label, input, value);
    }
    for (const selector of ['input.cw_isToContact', 'input.cw_isToResources', 'input.cw_isToCcs']) {
      const checkbox = one(selector, selector);
      if (checkbox.checked) checkbox.click();
      if (checkbox.checked) throw new Error('An email recipient checkbox could not be cleared');
    }
    const destinations = {
      Discussion: 'input.cw_isDiscussion',
      Internal: 'input.cw_isInternal',
      Resolution: 'input.cw_isResolution'
    };
    const selectedDestination = entry.addNoteTo || 'Discussion';
    if (!destinations[selectedDestination]) throw new Error('Unknown note destination');
    const selected = one(destinations[selectedDestination], selectedDestination);
    if (!selected.checked) selected.click();
    if (!selected.checked) throw new Error(`${selectedDestination} could not be selected`);
    for (const selector of Object.values(destinations).filter((value) => value !== destinations[selectedDestination])) {
      const checkbox = one(selector, selector);
      if (checkbox.checked) checkbox.click();
      if (checkbox.checked) throw new Error('An unwanted note destination could not be cleared');
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    const hours = Number(one('input.cw_hours', 'Actual Hours').value);
    const expectedHours = Math.round((endHour * 60 + endMinute - startHour * 60 - startMinute) / 60 * 100) / 100;
    if (!Number.isFinite(hours) || Math.abs(hours - expectedHours) > 0.02) warnings.push('Actual Hours');

    return { ok: true, saved: false, notesEntered: false, warnings: [...new Set(warnings)] };
  } catch (error) {
    return { ok: false, error: `Stopped while preparing the draft: ${error.message}. Review the form; it may be partly filled.` };
  }
}


