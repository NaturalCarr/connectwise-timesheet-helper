import { renderPlannedEod } from './eod-model.mjs';
import { isPayrollWrap, workReportNotes } from './payroll-report.mjs';
import { renderEod } from './eod-model.mjs';
export const verifiedEntry = entry => ['saved_verified','existing_verified'].includes(entry?.status);
const minutes = value => { const [h,m]=value.split(':').map(Number); return h*60+m; };
export function reviewPlan(plan, targetHours=8.5) {
  const days={};
  for(const item of plan.tickets) for(const entry of item.timeEntries) {
    const day=days[entry.date] ||= {date:entry.date,totalMinutes:0,billableMinutes:0,nonbillableMinutes:0,unknownBillingMinutes:0,lunchMinutes:0,gaps:[],overlaps:[],intervals:[]};
    const start=minutes(entry.start),end=minutes(entry.end),duration=end-start;
    day.totalMinutes+=duration;
    if(entry.billable==='B') day.billableMinutes+=duration;
    else if(['NB','NC'].includes(entry.billable)) day.nonbillableMinutes+=duration;
    else day.unknownBillingMinutes+=duration;
    if(/\blunch\b/i.test(entry.notes)) day.lunchMinutes+=duration;
    day.intervals.push({start,end,label:item.ticket.summary});
  }
  for(const day of Object.values(days)) {
    day.intervals.sort((a,b)=>a.start-b.start); let end=day.intervals[0]?.end;
    for(const interval of day.intervals.slice(1)) {
      if(interval.start>end) day.gaps.push({start:end,end:interval.start});
      if(interval.start<end) day.overlaps.push(interval);
      end=Math.max(end,interval.end);
    }
    day.shortfallMinutes=Math.max(0,Math.round(targetHours*60)-day.totalMinutes);
  }
  return {tickets:plan.tickets.map(item=>({summary:item.ticket.summary,lookup:item.existingTicketId?`Ticket #${item.existingTicketId}`:item.ticket.titleContains?`Title contains: ${item.ticket.titleContains}`:'Exact title at configured company/site',action:item.existingTicketId?'Reuse exact ticket; title fallback only after verified number miss':'Find/reuse; create only after verified no match',status:item.completedStatus,entries:item.timeEntries.length})),days:Object.values(days)};
}
export function resumePlan(plan, previous) {
  const next=structuredClone(plan);
  for(let i=0;i<next.tickets.length;i++) {
    const prior=previous?.results?.[i];
    if(prior?.ticketId) { next.tickets[i].existingTicketId=prior.ticketId; delete next.tickets[i].ticket.titleContains; }
  }
  return next;
}
export function combinedReports(runs) {
  const days=new Map();
  const reportDetails=new Map();
  for(const run of [...runs].sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt))){
    const details=run.plan.mode==='daily'?[{date:run.plan.date,...run.plan.endOfDay}]:(run.plan.endOfDays || []);
    for(const day of details){const prior=reportDetails.get(day.date)||{};reportDetails.set(day.date,{...prior,...(day.inventory?.length?{inventory:day.inventory}:{}),...(day.purchases?.length?{purchases:day.purchases}:{})});}
  }
  const finalStatuses=new Map();
  for(const run of [...runs].sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)))for(const result of run.result?.results||[]){if(['completed_verified','status_changed_verified'].includes(result.status)&&result.ticketStatus)finalStatuses.set(result.ticketId,{status:result.ticketStatus,at:run.updatedAt});}
  // Newest verified evidence for the same ticket/interval wins. Never infer a save from a pending entry.
  for(const run of [...runs].sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt))) {
    for(let i=0;i<(run.result?.results||[]).length;i++) {
      const result=run.result.results[i],item=run.plan.tickets[i];
      const final=finalStatuses.get(result.ticketId);
      if(!item || !result.ticketId || !final || final.at<run.updatedAt) continue;
      for(let j=0;j<(result.entries||[]).length;j++) {
        const saved=result.entries[j],entry=item.timeEntries[j];
        if(!entry || !verifiedEntry(saved) || isPayrollWrap(entry)) continue;
        const day=days.get(entry.date)||new Map(); days.set(entry.date,day);
        const key=`${result.ticketId}|${entry.start}|${entry.end}|${entry.notes}`;
        day.set(key,{ticketId:result.ticketId,summary:result.summary,status:final.status,entry,
          notes:workReportNotes(item,run.plan.mode==='daily'?run.plan.endOfDay?.tickets[i]?.notes:entry.notes),
          nextStep:run.plan.mode==='daily'?run.plan.endOfDay?.tickets[i]?.nextStep:entry.followUp});
      }
    }
  }
  return [...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,entries])=>{
    const tickets=new Map();
    for(const row of entries.values()) {
      const ticket=tickets.get(row.ticketId)||{ticketId:row.ticketId,summary:row.summary,status:row.status,notes:[],nextStep:[]};
      ticket.summary=row.summary; ticket.status=row.status;
      if(row.notes && !ticket.notes.includes(row.notes))ticket.notes.push(row.notes);
      if(row.nextStep && !ticket.nextStep.includes(row.nextStep))ticket.nextStep.push(row.nextStep);
      tickets.set(row.ticketId,ticket);
    }
    const rows=[...tickets.values()].map(row=>({...row,notes:row.notes.join('\n'),nextStep:row.nextStep.join('\n')}));
    const record={date,subject:`Daily Report - ${date}`,tickets:rows,...reportDetails.get(date)};
    return {...record,html:renderReport(record)};
  });
}
export function renderReport(record) {if(record.verification==='planned')return renderPlannedEod(record);return renderEod(record,record.tickets.map(row=>({...row,verified:true})));}
export async function allRuns() { const data=await chrome.storage.local.get(null);return Object.entries(data).filter(([key])=>key.startsWith('runHistory:')).map(([,value])=>value).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)); }
export async function saveRun(run) {run.updatedAt=new Date().toISOString();await chrome.storage.local.set({[`runHistory:${run.id}`]:run});}
export const defaultPresets=[{id:'huddle',name:'Morning huddle',workType:'Onsite Support',workRole:'Onsite Engineer',notes:'Attended the morning huddle.',billable:'B'},{id:'ops',name:'Ops check-in',workType:'Onsite Support',workRole:'Onsite Engineer',notes:'Checked in with the Ops team.',billable:'AUTO'},{id:'lunch',name:'Lunch',workType:'Payroll Wrap',workRole:'Onsite Engineer',notes:'Lunch break.',billable:'AUTO'}];
export function diagnostic(action,error,ticketId=null) {return {time:new Date().toISOString(),action,ticketId,message:String(error.message||error).replace(/https?:\/\/\S+/g,'[URL removed]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email removed]').replace(/(token|password|cookie|authorization)\s*[:=]\s*\S+/gi,'$1=[redacted]').slice(0,1500),helperVersion:globalThis.chrome?.runtime?.getManifest?.().version || '0.9.18'};}

export function mergeEvidence(previous, snapshot) {
  const results=(previous?.results||[]).map(row=>structuredClone(row));
  for(let i=0;i<(snapshot?.results||[]).length;i++){
    const current=snapshot.results[i],prior=results[i]||{};
    const entries=(prior.entries||[]).map(row=>({...row}));
    for(let j=0;j<(current.entries||[]).length;j++){
      const entry=current.entries[j]; if(verifiedEntry(entry)||!verifiedEntry(entries[j]))entries[j]={...entry};
    }
    const final=['completed_verified','status_changed_verified'].includes(current.status)?current:['completed_verified','status_changed_verified'].includes(prior.status)?prior:current;
    results[i]={...prior,...current,ticketId:current.ticketId||prior.ticketId||null,status:final.status,ticketStatus:final.ticketStatus,entries};
  }
  return {ok:false,results};
}
export function reviewText(plan,targetHours=8.5){
  const review=reviewPlan(plan,targetHours),hours=n=>(n/60).toFixed(2)+' h',time=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  return review.tickets.map((t,index)=>`${t.summary}\n  ${t.lookup}; ${t.action}\n  ${t.entries} entries; final status: ${t.status}\n${plan.tickets[index].timeEntries.map(e=>`  ${e.date} ${e.start}–${e.end} | ${e.workType} | ${e.billable} | ${e.notes}`).join('\n')}`).join('\n\n')+'\n\n'+review.days.map(d=>`${d.date}: ${hours(d.totalMinutes)} total (${hours(d.lunchMinutes)} lunch)\n  Billable ${hours(d.billableMinutes)}; nonbillable ${hours(d.nonbillableMinutes)}; AUTO/unconfirmed ${hours(d.unknownBillingMinutes)}\n  Gaps within entered day: ${d.gaps.map(g=>time(g.start)+'–'+time(g.end)).join(', ')||'none'}; overlaps: ${d.overlaps.length}\n  Below ${targetHours} h target by ${hours(d.shortfallMinutes)}. No time is added automatically.`).join('\n\n');
}

export function correctPendingHuddles(plan, evidence) {
 let changed=false;
 for(const [i,item] of plan.tickets.entries()) for(const [j,entry] of item.timeEntries.entries()){
  const saved=evidence?.results?.[i]?.entries?.[j];
  if(entry.workType==='Staff Meeting' && /huddle/i.test(entry.notes) && !verifiedEntry(saved) && saved?.status!=='save_attempted') {entry.workType='Onsite Support';changed=true;}
 }
 return changed;
}
