import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{}
test('rake workspace previews without saving and applies only selected changes',{skip:process.env.CW_BROWSER_TEST!=='1'||!chromium},async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{const page=await browser.newPage({viewport:{width:1180,height:950}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://helper.test/**',route=>{const name=new URL(route.request().url()).pathname.slice(1);try{return route.fulfill({body:readFileSync(new URL('../extension/'+name,import.meta.url)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.json')?'application/json':name.endsWith('.css')?'text/css':'text/javascript'});}catch{return route.fulfill({status:404});}});
 const company=JSON.parse(readFileSync(new URL('../ticket-settings.json',import.meta.url))).company;
 await page.addInitScript(({company})=>{
  const records=[{reference:'T-123',id:456,status:'Resolved'},{reference:'T-124',id:457,status:'On Hold'},{reference:'T-125',id:458,status:'Completed'}];
  let state=JSON.parse(localStorage.getItem('rake-fixture')||'null')||{'runHistory:example':{id:'example',updatedAt:'2026-11-13T20:00:00Z',plan:{tickets:records.map(r=>({ticket:{summary:'Example issue - '+r.reference}}))},result:{results:records.map(r=>({ticketId:r.id,summary:'Example issue - '+r.reference}))}}};
  window.writes=[];window.actions=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedDiagnostics=text;}}});const cwStates={456:'Working Issue Now',457:'Scheduled Onsite',458:'Completed'};
  const cw={id:1,url:'https://na.myconnectwise.net/v2025_1/ConnectWise.aspx',title:'ConnectWise'},iiq={id:2,url:'https://democracyprep.incidentiq.com/agent/dashboard',title:'Incident IQ'};
  window.chrome={permissions:{contains:async()=>true,request:async()=>true},tabs:{query:async({url})=>url.includes('myconnectwise')?(window.replacementTabs?[cw,{...cw,id:4}]:[cw]):(window.replacementTabs?[iiq,{...iiq,id:5}]:[iiq]),get:async id=>[2,5].includes(id)?{...iiq,id}:{...cw,id},update:async()=>{},create:async()=>({id:3})},storage:{local:{get:async keys=>keys===null?state:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,state[k]])),set:async data=>{state={...state,...data};localStorage.setItem('rake-fixture',JSON.stringify(state));}}},runtime:{getManifest:()=>({version:'test'}),getURL:path=>'https://helper.test/'+path,sendMessage:async message=>{window.actions.push(message);
   if(message.action==='listRakeOpenTickets')return {ok:true,rows:records.map(r=>({ticketId:r.id,summary:'Example issue - '+r.reference,status:cwStates[r.id]})),excludedClosed:0};
   if(message.action==='checkRakeEligibility')return {ok:true,eligible:!['Closed','Completed'].includes(cwStates[message.ticketId])};
   if(message.action==='readIiqStatus'){if(window.holdRead){window.holdRead=false;await new Promise(resolve=>{window.releaseRead=resolve;});}const r=records.find(r=>r.reference===message.reference);return{ok:true,reference:r.reference,status:r.status,url:'https://democracyprep.incidentiq.com/agent/tickets/11111111-1111-1111-1111-111111111111',observedAt:new Date().toISOString()};}
   if(message.action==='findRakeTickets'){const r=records.find(r=>r.reference===message.ticket.titleContains);return{ok:true,matches:[{ticketId:r.id,summary:'Example issue - '+r.reference}]};}
   if(message.action==='openTicket')return{ok:true,verified:true};
   if(message.action==='readRakeTicket'||message.action==='inspectTicket'){const r=records.find(r=>r.id===message.ticketId);return{ok:true,ticketId:r.id,summary:'Example issue - '+r.reference,status:cwStates[r.id],company};}
   if(message.action==='setTicketStatus'){if(window.failSave){window.failSave=false;return{ok:false,error:'Fixture transient stop'};}window.writes.push(message);cwStates[message.ticketId]=message.status;return{ok:true,saved:true,status:message.status};}
   throw Error('Unexpected browser action '+message.action);
  }}};
 },{company});
 await page.goto('https://helper.test/rake.html');await page.waitForFunction(()=>document.querySelector('#cw-tab').value==='1');
 await page.locator('#resources-filter').fill('*example*');await page.locator('#scan').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Scan finished'));
 assert.equal(await page.locator('.rake-row').count(),2);assert.equal(await page.evaluate(()=>window.writes.length),0);
 assert.equal(await page.locator('.review input[type=checkbox]').isChecked(),false);await page.screenshot({path:'.local/rake-preview.png',fullPage:true});
 await page.evaluate(()=>window.failSave=true);
 await page.locator('#apply').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Rake stopped'));
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.rake-row').length===2);
 await page.evaluate(()=>window.replacementTabs=true);await page.locator('#refresh-tabs').click();
 await page.locator('#cw-tab').selectOption('4');await page.locator('#iiq-tab').selectOption('5');
 assert.equal(await page.locator('.rake-row').count(),2);assert.equal(await page.locator('.change input[type=checkbox]').isChecked(),true);assert.equal(await page.locator('#apply').isEnabled(),true);assert.match(await page.locator('#apply').innerText(),/Continue/);
 assert.equal(await page.evaluate(()=>window.actions.filter(a=>a.action==='listRakeOpenTickets').length),0,'replacing tabs after restore must not start a full scan');
 await page.evaluate(()=>window.holdRead=true);await page.locator('#apply').click();await page.waitForFunction(()=>typeof window.releaseRead==='function');
 assert.equal(await page.locator('#copy-top').isEnabled(),true);assert.equal(await page.locator('#copy').isEnabled(),true);
 await page.locator('#copy-top').click();
 const copied=await page.evaluate(()=>JSON.parse(window.copiedDiagnostics));assert.equal(copied.working,true);assert.equal(copied.currentAction.action,'readIiqStatus');assert.equal(copied.currentAction.reference,'T-123');assert.equal(copied.preview.rows.length,2);
 await page.evaluate(()=>window.releaseRead());await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Selected CW statuses verified'));
 assert.equal(await page.evaluate(()=>window.actions.find(a=>a.action==='readIiqStatus').tabId),5);
 assert.equal(await page.evaluate(()=>window.actions.find(a=>a.action==='checkRakeEligibility').tabId),4);
 const writes=await page.evaluate(()=>window.writes);assert.equal(writes.length,1);assert.equal(writes[0].ticketId,456);assert.equal(writes[0].status,'Completed');assert.equal(writes[0].forceSave,true);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.rake-row').length===2);assert.equal(await page.locator('.unchanged').count(),1);assert.deepEqual(errors,[]);
 await page.setViewportSize({width:390,height:850});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:'.local/rake-mobile.png',fullPage:true});
 }finally{await browser.close();}
});
