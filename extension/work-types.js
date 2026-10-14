const helperWorkTypes = ['Admin', 'Client Meeting', 'Communications', 'Holiday',
  'Onsite Payroll Wrap', 'Onsite Support', 'Paid Time Off (Or Sick and Vacation)',
  'Payroll Wrap', 'Remote Support', 'Sales', 'Staff Meeting', 'Training', 'Travel',
  'Onsite [DO NOT USE]', 'Procurement'];
for (const id of ['ticket-time-work-type', 'work-type']) {
  const select = document.getElementById(id);
  for (const type of helperWorkTypes) {
    const option = new Option(type, type, type === 'Onsite Support', type === 'Onsite Support');
    if (type === 'Onsite [DO NOT USE]') option.disabled = true;
    select.add(option);
  }
}
