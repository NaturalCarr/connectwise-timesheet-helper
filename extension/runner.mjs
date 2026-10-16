import { applyTicketOwner } from './owner-settings.mjs';
import { executePlan } from './execute-plan.mjs';
import { chooseConnectWiseTab, mainWorkspaceTab } from './navigation.mjs';
import { allRuns, saveRun, resumePlan, reviewPlan, combinedReports, diagnostic, mergeEvidence, reviewText } from './workflow.mjs';
import { attachReportEditor } from './report-editor.mjs';
const $=id=>document.getElementById(id),status=$('status'),output=$('result');
const params=new URLSearchParams(location.hash.slice(1));
let run,reportResult,tabId,busy=false,legacyTicket=false;
const copyIcon=$('copy-run-result').innerHTML;
$('copy-run-result').onclick=async()=>{try{await navigator.clipboard.writeText(output.textContent);$('copy-run-status').textContent='Results copied.';}catch(e){$('copy-run-status').textContent=e.message;}};
$('copy-diagnostics').innerHTML=copyIcon;
$('copy-diagnostics').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(run?.diagnostics||[],null,2));$('copy-run-status').textContent='Redacted diagnostics copied.';}catch(e){$('copy-run-status').textContent=e.message;}};
async function send(action,tabId,fields={}) {
  const result=await chrome.runtime.sendMessage({action,tabId,...fields});
  if(!result?.ok){const error=new Error(result?.error||action+' failed.');if(Number.isSafeInteger(result?.ticketId))error.ticketId=result.ticketId;
    const info=diagnostic(action,error,fields.ticketId||error.ticketId); 
    if(fields.entry)info.entry={date:fields.entry.date,start:fields.entry.start,end:fields.entry.end};
    try{const state=await chrome.runtime.sendMessage({action:'inspectRunDiagnostics',tabId});if(state?.ok)info.controls=state.frames;}catch{}
    run.diagnostics=(run.diagnostics||[]).concat(info).slice(-100);await saveRun(run);throw error;}
  return result;
}
function showReview(plan){$('review').textContent=reviewText(plan);}
async function showReports(){
 const reports=combinedReports(await allRuns());
 if(!reports.length){$('daily-report').hidden=true;return;}
 for(const report of reports){const key='eodDraft:'+report.date;const saved=(await chrome.storage.local.get(key))[key];
  if(saved)for(const row of report.tickets){const override=saved[row.ticketId];if(override && override.source===JSON.stringify([row.notes,row.nextStep])){row.notes=override.notes;row.nextStep=override.nextStep;}}
 }
 const sources=new Map(combinedReports(await allRuns()).map(r=>[r.date,new Map(r.tickets.map(t=>[t.ticketId,JSON.stringify([t.notes,t.nextStep])]))]));
 $('daily-report').hidden=false;
 attachReportEditor(reports,{select:$('email-date'),preview:$('email-preview'),editor:$('email-editor'),copy:$('copy-daily-email'),status:$('email-status'),onSave:async(report)=>{
  const value=Object.fromEntries(report.tickets.map(row=>[row.ticketId,{notes:row.notes,nextStep:row.nextStep,source:sources.get(report.date).get(row.ticketId)}]));
  await chrome.storage.local.set({['eodDraft:'+report.date]:value});
 }});
 $('email-status').textContent='Combined verified work from saved runs. A stopped run can leave this report incomplete. Edits affect email only.';
}
async function execute(){
 if(busy)return;
 await navigator.locks.request('connectwise-helper-browser-run',{ifAvailable:true},async lock=>{
 if(!lock){status.textContent='Another helper run is active. Finish or stop it before starting this run.';return;}
 busy=true;$('start-run').disabled=true;
 try{
  const plan=resumePlan(run.plan,run.evidence||run.result);run.state='running';await saveRun(run);
  tabId=await mainWorkspaceTab(await chooseConnectWiseTab(params),message=>status.textContent=message);
  const driver = {
    async readTicketSummary(ticketId) {
      return (await send('inspectTicket', tabId, { ticketId })).summary;
    },
    async findTickets(ticket) {
      status.textContent = `Searching for ${ticket.summary}…`;
      return (await send('findTickets', tabId, { ticket })).matches;
    },
    async createTicket(ticket) {
      status.textContent = `Creating ${ticket.summary}…`;
      return (await send('createTicket', tabId, { ticket })).ticketId;
    },
    async openTicket(ticketId, ticket, lookup = {}) {
      return (await send('openTicket', tabId, { ticketId, ticket, numberOnly: lookup.numberOnly === true })).verified;
    },
    async ensureTicketOwner(ticketId, owner) {
      status.textContent = `Verifying Ticket Owner on #${ticketId}…`;
      return (await send('ensureTicketOwner', tabId, { ticketId, owner })).verified;
    },
    async setTicketStatus(ticketId, ticketStatus) {
      status.textContent = `Setting ticket #${ticketId} to ${ticketStatus}…`;
      await send('setTicketStatus', tabId, { ticketId, status: ticketStatus });
    },
    async verifyTicketStatus(ticketId, ticketStatus) {
      return (await send('verifyTicketStatus', tabId, { ticketId, status: ticketStatus })).verified;
    },
    async findTimeEntries(ticketId, entry) {
      const result = await send('findTimeEntries', tabId, { ticketId, entry });
      this.baselineTimeCount = result.total;
      return result.matches;
    },
    async openNewTimeEntry(ticketId) {
      return (await send('openNewTimeEntry', tabId, { ticketId })).ok;
    },
    async fillTimeEntry(ticketId, entry) {
      status.textContent = `Preparing ${entry.date} ${entry.start}–${entry.end} on ticket #${ticketId}…`;
      this.prepared = await send('prepareTimeDraft', tabId, { ticketId, entry });
    },
    async verifyTimeDraft(ticketId, entry) {
      return (await send('verifyPreparedTime', tabId,
        { ticketId, frameId: this.prepared?.frameId, entry })).verified;
    },
    async saveTimeEntry(ticketId, entry) {
      status.textContent = `Saving ${entry.date} ${entry.start}–${entry.end} on ticket #${ticketId}…`;
      await send('savePreparedTime', tabId,
        { ticketId, frameId: this.prepared?.frameId, entry,
          baselineTimeCount: this.baselineTimeCount });
    },
    async verifyTimeEntry(ticketId, entry) {
      const result = await send('verifySavedTime', tabId,
        { ticketId, entry, baselineTimeCount: this.baselineTimeCount });
      return { verified: result.verified, timeId: result.row?.timeId || null, billable: result.row?.billable || null };
    }
  };

  const previous=run.evidence||run.result;
  const result=await executePlan(plan,driver,{previous,onCheckpoint:async snapshot=>{run.evidence=mergeEvidence(run.evidence||run.result,snapshot);run.result=snapshot;await saveRun(run);},onProgress:async progress=>{
    run.progress=progress;await saveRun(run);
    const list=$('progress');while(list.children.length<plan.tickets.length)list.append(document.createElement('li'));
    list.children[progress.ticketIndex].textContent=plan.tickets[progress.ticketIndex].ticket.summary+' — '+progress.action+' ('+progress.state+')';
  }});
  run.evidence=mergeEvidence(run.evidence,result);run.result=result;if(!result.ok){const stopped=result.results.at(-1);run.diagnostics=(run.diagnostics||[]).concat(diagnostic(stopped.step,stopped.error,stopped.ticketId)).slice(-100);}run.state=result.ok?'completed':'stopped';await saveRun(run);
  output.textContent=JSON.stringify(result,null,2);$('copy-run-result').disabled=false;
  status.textContent=result.ok?'Run saved and verified. Combined EoD reports are below.':'Run stopped. Review results and diagnostics; Resume rechecks saved records.';
  $('start-run').textContent=result.ok?'Recheck saved run':'Resume stopped run';
  if(result.ok)await chrome.storage.local.remove('popupDraft:week');
  await showReports();
  if(reportResult){const reply={...result};if(result.ok){reply.endOfDays=combinedReports([run]);if(plan.mode==='daily')reply.endOfDay=reply.endOfDays[0];}await reportResult(legacyTicket?{...reply.results?.[0],entry:reply.results?.[0]?.entries?.length===1?reply.results[0].entries[0]:undefined,ok:reply.ok}:reply);}
 }catch(error){run.state='stopped';run.diagnostics=(run.diagnostics||[]).concat(diagnostic('runner',error));await saveRun(run);status.textContent=error.message;output.textContent=JSON.stringify(run.result||{ok:false,error:error.message},null,2);$('copy-run-result').disabled=false;}
 finally{busy=false;$('start-run').disabled=false;}
 });
}
async function main(){
 let plan;
 if(params.get('source')==='history'){
   const id=params.get('runId');run=(await chrome.storage.local.get('runHistory:'+id))['runHistory:'+id];
   if(!run)throw new Error('Saved run was not found.');plan=run.plan;
 }else if(params.get('source')==='upload'){
   const id=params.get('jobId');if(!/^[0-9a-f-]{36}$/i.test(id||''))throw new Error('Invalid job ID.');
   const key=(params.get('kind')==='ticket'?'ticketJob:':'weeklyJob:')+id;plan=(await chrome.storage.local.get(key))[key]||(await chrome.storage.session.get(key))[key];
 }else{
   const port=Number(params.get('port')),token=params.get('token');
   if(!Number.isSafeInteger(port)||port<1||port>65535||!/^[a-f0-9]{64}$/.test(token||''))throw new Error('The local job address is invalid.');
   const base='http://127.0.0.1:'+port;const response=await fetch(base+'/job?token='+token);if(!response.ok)throw new Error('Local job server returned '+response.status);({plan}=await response.json());
   reportResult=result=>fetch(base+'/result?token='+token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
 }
 if(plan?.ticket && !plan.tickets){legacyTicket=true;const single=plan;const entries=single.timeEntries||(single.timeEntry?[single.timeEntry]:[]);plan={mode:'ticket',exampleOnly:single.exampleOnly,tickets:[{...single,timeEntries:entries,completedStatus:entries.length&&single.completeAfterTime?single.completedStatus:single.ticket.status}],totalEntries:entries.length};}
 if(!plan||plan.exampleOnly||!Array.isArray(plan.tickets))throw new Error('A validated non-example plan is required.');
 if(!run){await applyTicketOwner(plan);run={id:crypto.randomUUID(),createdAt:new Date().toISOString(),plan,state:'ready',diagnostics:[]};await saveRun(run);if(params.get('source')==='upload'){const stagedKey=(params.get('kind')==='ticket'?'ticketJob:':'weeklyJob:')+params.get('jobId');await chrome.storage.local.remove(stagedKey);await chrome.storage.session.remove(stagedKey);}}
 history.replaceState(null,'',location.pathname+'#source=history&runId='+run.id);
 showReview(plan);$('start-run').hidden=false;$('start-run').textContent=run.result?'Resume / recheck saved run':'Start reviewed run';
 status.textContent='Review planned lookups, statuses, time totals, gaps and billing below. AUTO billing remains unknown until read from ConnectWise.';
 if(run.result){output.textContent=JSON.stringify(run.result,null,2);$('copy-run-result').disabled=false;}
 await showReports();$('start-run').onclick=execute;
 if(reportResult)await execute();
}
main().catch(async error=>{status.textContent='Run stopped: '+error.message;output.textContent=JSON.stringify({ok:false,error:error.message},null,2);$('copy-run-result').disabled=false;});

