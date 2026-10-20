const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderEodExtras(record) {
 const cell = 'border:1px solid #444;padding:8px;text-align:left;vertical-align:top';
 const table = rows => '<table style="border-collapse:collapse;border:1px solid #444;color:#111;background:#fff" border="1" cellspacing="0" cellpadding="8">'+rows+'</table>';
 const inventory = (record.inventory || []).filter(row => String(row.item || '').trim() || String(row.count || '').trim());
 const purchases = (record.purchases || []).filter(row => row.item || row.quantity || row.url);
 let html = inventory.length ? '<h3>Inventory</h3>'+table('<tr><th style="'+cell+'">Item</th><th style="'+cell+'">Count / details</th></tr>'+inventory.map(row => '<tr><td style="'+cell+'">'+escape(row.item)+'</td><td style="'+cell+'">'+escape(row.count)+'</td></tr>').join('')) : '';
 if(purchases.length) html += '<h3>Recommended purchases</h3><ul>'+purchases.map(row => {
  let url; try { url = new URL(row.url); } catch { throw new Error('Enter a valid purchase link.'); }
  if(!['https:','http:'].includes(url.protocol)) throw new Error('Purchase links must use https:// or http://.');
  if(!String(row.item || '').trim() || !Number.isSafeInteger(Number(row.quantity)) || Number(row.quantity) < 1) throw new Error('Each purchase needs an item name and a positive whole-number quantity.');
  return '<li><a href="'+escape(url.href)+'">'+escape(row.item)+' × '+Number(row.quantity)+'</a></li>';
 }).join('')+'</ul>';
 return html;
}
