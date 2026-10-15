(() => {
  function fit(field) {
    if (!field.getClientRects().length) return;
    if (['ticket-json', 'week-json'].includes(field.id)) {
      field.rows = 2;
      field.style.height = '52px';
      field.style.overflowY = 'auto';
      return;
    }
    field.rows = 1;
    if (!field.value) { field.style.height = '34px'; return; }
    field.style.height = '0px';
    const style = getComputedStyle(field);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    field.style.height = `${Math.max(34, field.scrollHeight + border)}px`;
  }
  const all = () => document.querySelectorAll('textarea').forEach(fit);
  document.addEventListener('input', (event) => { if (event.target.matches('textarea')) fit(event.target); });
  document.addEventListener('toggle', all, true);
  for (const name of ['popup-drafts-restored', 'popup-drafts-cleared']) document.addEventListener(name, () => requestAnimationFrame(all));
  document.addEventListener('change', () => requestAnimationFrame(all));
  document.addEventListener('click', () => requestAnimationFrame(all));
  new ResizeObserver(() => requestAnimationFrame(all)).observe(document.body);
  all();
})();
