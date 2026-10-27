import { allRuns, combinedReports, reviewPlan, verifiedEntry, renderReport } from './workflow.mjs';
import { attachReportEditor } from './report-editor.mjs';
const $=id=>document.getElementById(id);
let storedRuns=[],pageIndex=0,loadVersion=0;const pageSize=6;
const duration=minutes=>Math.floor(minutes/60)+'h '+Math.round(minutes%60)+'m';
const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
function renderRuns(){
 const query=$('run-search').value.trim().toLowerCase(),filter=$('run-filter').value;
 const matches=storedRuns.filter(run=>{const state=run.state||'ready';const content=[run.plan?.date,run.plan?.weekStart,...(run.plan?.tickets||[]).map(t=>t.ticket?.summary),...(run.result?.results||[]).map(t=>t.ticketId)].join(' ').toLowerCase();return (!query||content.includes(query))&&(filter==='all'||filter==='unfinished'&&state!=='completed'||filter===state);});
 pageIndex=Math.max(0,Math.min(pageIndex,Math.ceil(matches.length/pageSize)-1));$('runs').replaceChildren();
 for(const run of matches.slice(pageIndex*pageSize,(pageIndex+1)*pageSize)){
  const items=run.plan?.tickets||[],results=(run.evidence||run.result)?.results||[],state=run.state||'ready';
  const article=make('article','history-run'),head=make('div','history-run-head'),info=make('div');
  const date=run.plan?.date||run.plan?.weekStart||'Ticket run';const title=make('h3','',items.length===1?(items[0].ticket?.summary||'Ticket run'):(run.plan?.weekStart&&!run.plan?.date?'Weekly timesheet':'Daily timesheet'));const dateLabel=make('div','run-date',date);
  const badge=make('span','state-badge '+(['completed','stopped','running','ready'].includes(state)?state:'ready'),state);
  const verified=results.reduce((n,r)=>n+(r.entries||[]).filter(verifiedEntry).length,0),planned=items.reduce((n,t)=>n+(t.timeEntries||[]).length,0);
  const checkpoint=new Date(run.updatedAt);const updated=Number.isNaN(checkpoint.getTime())?'Unknown':checkpoint.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  info.append(dateLabel,title,badge,make('p','',items.length+' ticket'+(items.length===1?'':'s')+' · '+verified+'/'+planned+' time entries verified · Updated '+updated));
  const link=make('a','button-link'+(state==='stopped'?' primary':''),state==='completed'?'View results':state==='ready'?'Review run':state==='running'?'Open run':'Resume run');link.href='runner.html#source=history&runId='+encodeURIComponent(run.id);head.append(info,link);article.append(head);
  const details=make('details'),summary=make('summary','','Tickets and progress'),list=make('ul','run-tickets');
  items.forEach((item,index)=>{const result=results[index],row=make('li');row.append(make('span','',item.ticket?.summary||'Untitled ticket'),make('small','',(result?.ticketId?'#'+result.ticketId+' · ':'')+(result?.status?.replaceAll('_',' ')||'Not started')));list.append(row);});details.append(summary,list);article.append(details);$('runs').append(article);
 }
 if(!matches.length)$('runs').append(make('div','empty-state',storedRuns.length?'No runs match your search. Try another date, title, or status.':'No saved runs yet. Start a ticket or timesheet from the workspace.'));
 $('page-summary').textContent=matches.length?((pageIndex*pageSize+1)+'–'+Math.min((pageIndex+1)*pageSize,matches.length)+' of '+matches.length+' runs'):'0 runs';$('previous-page').disabled=pageIndex===0;$('next-page').disabled=(pageIndex+1)*pageSize>=matches.length;
}
function renderTotals(days){$('totals').replaceChildren();if(!days.length){$('totals').append(make('div','empty-state','No verified time yet. Saved rows will appear here.'));return;}
 for(const day of [...days].sort((a,b)=>b.date.localeCompare(a.date))){const card=make('article','time-card'),head=make('div','time-card-head');head.append(make('h3','',day.date),make('span','time-total',duration(day.totalMinutes)+' saved'));const breakdown=make('div','time-breakdown');for(const text of ['Billable '+(day.billableMinutes/60).toFixed(2)+' h','Nonbillable '+(day.nonbillableMinutes/60).toFixed(2)+' h','Billing unconfirmed '+(day.unknownBillingMinutes/60).toFixed(2)+' h','Lunch '+duration(day.lunchMinutes)])breakdown.append(make('span','',text));
 const details=make('details');details.append(make('summary','','Coverage and gaps'),make('p','',day.gaps.length+' gaps · '+day.overlaps.length+' overlaps · '+duration(day.shortfallMinutes)+' short of the 8.5-hour target. Gaps are not counted as work.'));card.append(head,breakdown,details);$('totals').append(card);}
}
async function load(){const version=++loadVersion;$('refresh').disabled=true;$('history-status').textContent='';
 try{const runs=await allRuns();if(version!==loadVersion)return;storedRuns=runs;renderRuns();$('run-count').textContent=runs.length;$('attention-count').textContent=runs.filter(r=>r.state!=='completed').length;
 const entries=new Map();for(const run of [...runs].reverse())for(let i=0;i<((run.evidence||run.result)?.results||[]).length;i++){const result=(run.evidence||run.result).results[i],item=run.plan.tickets[i];for(let j=0;j<(result.entries||[]).length;j++){const saved=result.entries[j],entry=item?.timeEntries[j];if(result.ticketId&&entry&&verifiedEntry(saved))entries.set([result.ticketId,entry.date,entry.start,entry.end,entry.notes].join('|'),{...entry,billable:saved.billable||entry.billable});}}
 const total=reviewPlan({tickets:[{ticket:{summary:'Verified time'},timeEntries:[...entries.values()]}]});renderTotals(total.days);$('saved-time').textContent=duration(total.days.reduce((n,d)=>n+d.totalMinutes,0));
 const reports=combinedReports(runs).reverse();$('report-empty').hidden=!!reports.length;$('report-edit').hidden=!reports.length;$('dates').disabled=!reports.length;$('copy').disabled=!reports.length;
 if(!reports.length){$('dates').value='';$('editor').replaceChildren();$('preview').replaceChildren();$('preview').previousElementSibling?.matches('.eod-extras')&&$('preview').previousElementSibling.remove();$('status').textContent='';return;}
 const sources=new Map();for(const r of reports)for(const t of r.tickets)sources.set(r.date+'|'+t.ticketId,JSON.stringify([t.notes,t.nextStep]));
 for(const report of reports){const key='eodDraft:'+report.date,overrides=(await chrome.storage.local.get(key))[key]||{};if(version!==loadVersion)return;for(const row of report.tickets){const o=overrides[row.ticketId];if(o?.source===sources.get(report.date+'|'+row.ticketId)){row.notes=o.notes;row.nextStep=o.nextStep;}}report.html=renderReport(report);}
 attachReportEditor(reports,{select:$('dates'),preview:$('preview'),editor:$('editor'),copy:$('copy'),status:$('status'),onSave:async report=>chrome.storage.local.set({['eodDraft:'+report.date]:Object.fromEntries(report.tickets.map(t=>[t.ticketId,{notes:t.notes,nextStep:t.nextStep,source:sources.get(report.date+'|'+t.ticketId)}]))})});$('status').textContent='';
 }catch(error){$('history-status').textContent=error.message;}finally{if(version===loadVersion)$('refresh').disabled=false;}
}
for(const el of [$('run-search'),$('run-filter')])el.addEventListener(el.tagName==='INPUT'?'input':'change',()=>{pageIndex=0;renderRuns();});
$('previous-page').onclick=()=>{pageIndex--;renderRuns();};$('next-page').onclick=()=>{pageIndex++;renderRuns();};$('refresh').onclick=load;
const tabs=[...document.querySelectorAll('[role=tab]')];function activate(tab){for(const t of tabs){const selected=t===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;$(t.dataset.panel).hidden=!selected;}}
for(const [index,tab] of tabs.entries()){tab.onclick=()=>activate(tab);tab.onkeydown=event=>{let next;if(event.key==='ArrowRight')next=tabs[(index+1)%tabs.length];if(event.key==='ArrowLeft')next=tabs[(index+tabs.length-1)%tabs.length];if(event.key==='Home')next=tabs[0];if(event.key==='End')next=tabs.at(-1);if(next){event.preventDefault();activate(next);next.focus();}};}
load();
