import { allRuns, combinedReports, reviewPlan, verifiedEntry, renderReport } from './workflow.mjs';
import { attachReportEditor } from './report-editor.mjs';
const $=id=>document.getElementById(id);
async function load(){
 const runs=await allRuns();$('runs').replaceChildren();
 for(const run of runs){const article=document.createElement('article');const title=document.createElement('h3');title.textContent=`${run.plan.date||run.plan.weekStart||'Ticket run'} — ${run.state}`;const info=document.createElement('p');info.textContent=`${run.plan.tickets.length} tickets · Last checkpoint ${run.updatedAt}`;const link=document.createElement('a');link.textContent='Open / resume / review';link.href='runner.html#source=history&runId='+encodeURIComponent(run.id);article.append(title,info,link);$('runs').append(article);}
 const entries=new Map();
 for(const run of [...runs].reverse())for(let i=0;i<(run.result?.results||[]).length;i++){
  const result=run.result.results[i],item=run.plan.tickets[i];
  for(let j=0;j<(result.entries||[]).length;j++){const saved=result.entries[j],entry=item?.timeEntries[j];if(entry&&verifiedEntry(saved))entries.set([result.ticketId,entry.date,entry.start,entry.end,entry.notes].join('|'),{...entry,billable:saved.billable||entry.billable});}
 }
 const total=reviewPlan({tickets:[{ticket:{summary:'Verified time'},timeEntries:[...entries.values()]}]});
 $('totals').textContent=total.days.map(d=>d.date+' — '+(d.totalMinutes/60).toFixed(2)+' h saved; '+(d.lunchMinutes/60).toFixed(2)+' h lunch\nBillable '+(d.billableMinutes/60).toFixed(2)+' h · Nonbillable '+(d.nonbillableMinutes/60).toFixed(2)+' h · Billing unconfirmed '+(d.unknownBillingMinutes/60).toFixed(2)+' h\nGaps within entered day: '+d.gaps.length+' · Overlaps: '+d.overlaps.length+' · Short of 8.5 h target: '+(d.shortfallMinutes/60).toFixed(2)+' h').join('\n\n')||'No verified time yet.';
 const reports=combinedReports(runs);if(!reports.length){$('status').textContent='No verified Daily Report rows yet.';$('copy').disabled=true;return;}
 const sources=new Map();for(const r of reports)for(const t of r.tickets)sources.set(r.date+'|'+t.ticketId,JSON.stringify([t.notes,t.nextStep]));
 for(const report of reports){const key='eodDraft:'+report.date;const overrides=(await chrome.storage.local.get(key))[key]||{};for(const row of report.tickets){const o=overrides[row.ticketId];if(o?.source===sources.get(report.date+'|'+row.ticketId)){row.notes=o.notes;row.nextStep=o.nextStep;}}report.html=renderReport(report);}
 $('copy').disabled=false;
 attachReportEditor(reports,{select:$('dates'),preview:$('preview'),editor:$('editor'),copy:$('copy'),status:$('status'),onSave:async report=>chrome.storage.local.set({['eodDraft:'+report.date]:Object.fromEntries(report.tickets.map(t=>[t.ticketId,{notes:t.notes,nextStep:t.nextStep,source:sources.get(report.date+'|'+t.ticketId)}]))})});
}
$('refresh').onclick=()=>load().catch(error=>$('status').textContent=error.message);
load().catch(error=>$('status').textContent=error.message);
