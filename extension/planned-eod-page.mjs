import { plannedReports } from './planned-eod.mjs';
import { attachReportEditor } from './report-editor.mjs';
const $=id=>document.getElementById(id);
try {
 const id=location.hash.slice(1);if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Invalid report reference.');
 const key='plannedEod:'+id, plan=(await chrome.storage.local.get(key))[key];
 if(!plan)throw new Error('Report source unavailable. Validate the JSON again.');
 const reports=plannedReports(plan);if(!reports.length)throw new Error('No report dates in this record.');
 attachReportEditor(reports,{select:$('date'),preview:$('preview'),editor:$('editor'),copy:$('copy'),status:$('status')});
 $('copy').disabled=false;$('status').textContent='Ready to copy. You can edit notes, inventory and purchase links before pasting.';
} catch(error){$('status').textContent=error.message;}
