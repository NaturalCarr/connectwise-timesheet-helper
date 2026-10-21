export const formatInventoryCount = value => String(value ?? '').replace(/(\d+)\s*(?:[x×]\s*)?(M\d+)\b/gi, (_,amount,model) => amount+' x '+model.toUpperCase());
export function normalizeEodExtras(value = {}) {
 if(!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('EoD details must be an object.');
 if(value.inventory !== undefined && !Array.isArray(value.inventory)) throw new Error('Inventory must be an array.');
 if(value.purchases !== undefined && !Array.isArray(value.purchases)) throw new Error('Purchases must be an array.');
 const inventory = (value.inventory || []).map(row => {
  if(!row || typeof row.item !== 'string' || !row.item.trim()) throw new Error('Each inventory row needs an item name.');
  let count = row.count;
  if(row.quantity !== undefined) {
   if(!Number.isSafeInteger(row.quantity) || row.quantity < 0) throw new Error('Inventory quantity must be a nonnegative whole number.');
   count = String(row.quantity)+(row.model ? ' x '+String(row.model).trim() : '');
  }
  if(typeof count !== 'string' || !count.trim()) throw new Error('Each inventory row needs count details or a quantity.');
  return {item:row.item.trim(),count:formatInventoryCount(count.trim())};
 });
 const grouped=[];
 for(const row of inventory){const prior=grouped.find(other=>other.item.toLowerCase()===row.item.toLowerCase());if(prior)prior.count+=', '+row.count;else grouped.push({...row});}
 const result={inventory:grouped,purchases:value.purchases || []}; renderEodExtras(result); return result;
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderEodExtras(record, integrated = false) {
 const cell = 'border:1px solid #444;padding:8px;text-align:left;vertical-align:top';
 const table = rows => '<table style="border-collapse:collapse;border:1px solid #444;color:#111;background:#fff" border="1" cellspacing="0" cellpadding="8">'+rows+'</table>';
 const inventory = (record.inventory || []).filter(row => String(row.item || '').trim() || String(row.count || '').trim());
 const purchases = (record.purchases || []).filter(row => row.item || row.quantity || row.url);
 let html = inventory.length ? '<h3>Inventory</h3>'+table('<tr><th style="'+cell+'">Item</th><th style="'+cell+'">Count / details</th></tr>'+inventory.map(row => '<tr><td style="'+cell+'">'+escape(row.item)+'</td><td style="'+cell+'">'+escape(formatInventoryCount(row.count))+'</td></tr>').join('')) : '';
 if(integrated) html = inventory.length ? '<tr><th colspan="4" style="'+cell+';background-color:#eee">Inventory</th></tr>'+inventory.map(row => '<tr><th colspan="2" style="'+cell+'">'+escape(row.item)+'</th><td colspan="2" style="'+cell+'">'+escape(formatInventoryCount(row.count))+'</td></tr>').join('') : '';
 if(purchases.length) html += (integrated ? '<tr><td colspan="4" style="'+cell+'">' : '') + '<h3>Recommended purchases</h3><ul>'+purchases.map(row => {
  let url; try { url = new URL(row.url); } catch { throw new Error('Enter a valid purchase link.'); }
  if(!['https:','http:'].includes(url.protocol)) throw new Error('Purchase links must use https:// or http://.');
  if(!String(row.item || '').trim() || !Number.isSafeInteger(Number(row.quantity)) || Number(row.quantity) < 1) throw new Error('Each purchase needs an item name and a positive whole-number quantity.');
  return '<li><a href="'+escape(url.href)+'">'+escape(row.item)+' × '+Number(row.quantity)+'</a></li>';
 }).join('')+'</ul>'+(integrated ? '</td></tr>' : '');
 return html;
}
