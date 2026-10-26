import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{}
const enabled=process.env.CW_BROWSER_TEST==='1'&&chromium;
test('runner survives reload after save, resumes without duplicate and edits combined Daily Report locally',{skip:!enabled},async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://helper.test/**',route=>{const path=new URL(route.request().url()).pathname.slice(1);try{route.fulfill({body:readFileSync(new URL('../extension/'+path,import.meta.url)),contentType:path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript'});}catch{route.fulfill({status:404,body:''});}});
 await page.addInitScript(()=>{
 const key='test-state';let values=JSON.parse(localStorage.getItem(key)||'{}');
 const persist=()=>localStorage.setItem(key,JSON.stringify(values));
 const entry={date:'2026-10-16',start:'08:00',end:'08:15',notes:'Actual work',workType:'Onsite Support',workRole:'Onsite Engineer',billable:'AUTO'};
 values['helperSettings:ticketOwner']='Person';
 values['weeklyJob:00000000-0000-0000-0000-000000000001']={exampleOnly:false,tickets:[{recordId:'a',ticket:{summary:'T-1 - Work',status:'Working Issue Now',owner:'Person'},completedStatus:'Completed',timeEntries:[entry]}]};persist();
 const storage={async get(keys){values=JSON.parse(localStorage.getItem(key)||'{}');if(keys===null)return structuredClone(values);return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(values[k])]))},async set(next){values=JSON.parse(localStorage.getItem(key)||'{}');Object.assign(values,next);persist();},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete values[k];persist();}};
 window.chrome={storage:{local:storage,session:storage},tabs:{async get(){return {id:7,url:'https://na.myconnectwise.net/v2025_1/connectwise.aspx'}},async query(){return [{id:7}]},async update(){},async create(){}},runtime:{getURL:path=>'https://helper.test/'+path,async sendMessage(message){
  values=JSON.parse(localStorage.getItem(key)||'{}');values.actions=(values.actions||[]).concat(message.action);persist();
  switch(message.action){
   case 'findTickets':return {ok:true,matches:[{ticketId:123}]};
   case 'openTicket':return {ok:true,verified:true};
   case 'inspectTicket':return {ok:true,summary:'T-1 - Work'};
   case 'ensureTicketOwner':return {ok:true,verified:true};
   case 'setTicketStatus':return {ok:true};
   case 'verifyTicketStatus':return {ok:true,verified:true};
   case 'findTimeEntries':return {ok:true,total:values.saved?1:0,matches:values.saved?[{billable:'B'}]:[]};
   case 'openNewTimeEntry':return {ok:true};
   case 'prepareTimeDraft':await new Promise(resolve=>setTimeout(resolve,300));return {ok:true,frameId:4};
   case 'verifyPreparedTime':return {ok:true,verified:true};
   case 'savePreparedTime':values.saved=true;values.saves=(values.saves||0)+1;persist();return {ok:true};
   case 'verifySavedTime':return {ok:false,error:'one-off verification failure'};
   case 'inspectRunDiagnostics':return {ok:true,frames:[{frameId:4,statusInputs:1}]};
   default:throw Error('Unexpected '+message.action);
  }
 }}};
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async write(items){window.copied=await items[0].getType('text/html').then(blob=>blob.text());},async writeText(text){window.copied=text;}}});
 });
 await page.goto('https://helper.test/runner.html#source=upload&jobId=00000000-0000-0000-0000-000000000001');
 await page.waitForFunction(()=>!document.getElementById('start-run').hidden);
 assert.match(await page.locator('#review').textContent(),/Billing: ConnectWise default/);
 await page.waitForFunction(()=>document.querySelectorAll('#run-mascot .carlton-frame').length===11);
 assert.equal(await page.locator('[data-mascot-label]').textContent(),'Ready');
 assert.equal(await page.locator('#review .review-ticket').count(),1);
 assert.equal(await page.locator('#review .review-ticket').getAttribute('open'),null);
 assert.equal(await page.locator('#review .review-entry').isVisible(),false);
 await page.locator('#review .review-ticket summary').click();
 assert.equal(await page.locator('#review .review-entry').isVisible(),true);
 await page.locator('#review .review-ticket summary').click();
 assert.equal(await page.locator('#result').evaluate(el=>el.getBoundingClientRect().height),160);
 await page.locator('#toggle-logs').click();assert.equal(await page.locator('#toggle-logs').getAttribute('aria-expanded'),'true');
 await page.locator('#toggle-logs').click();assert.equal(await page.locator('#toggle-logs').textContent(),'+');
 assert.equal(await page.locator('#result').evaluate(el=>el.getBoundingClientRect().height),160);
 await page.screenshot({path:'.local/prerun-ticket-cards.png',fullPage:true});
 await page.locator('#start-run').click();
 await page.waitForFunction(()=>document.querySelector('#run-mascot').dataset.state==='working');
 assert.equal(await page.locator('[data-mascot-label]').textContent(),'Working...');
 await page.screenshot({path:'.local/runner-carlton-working.png',fullPage:true});
 await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Run stopped.'));
 assert.equal(await page.locator('[data-mascot-label]').textContent(),'Stopped');
 assert.equal(await page.locator('#run-mascot').getAttribute('data-state'),'stopped');
 await page.screenshot({path:'.local/runner-carlton-stopped.png',fullPage:true});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-state')).saves),1);
 const savedUrl=page.url();assert.match(savedUrl,/source=history/);
 await page.reload();await page.waitForFunction(()=>!document.getElementById('start-run-top').hidden);
 assert.equal(await page.locator('#start-run-top').textContent(),await page.locator('#start-run').textContent());
 await page.locator('#start-run-top').click();
 await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Run saved and verified.'));
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-state')).saves),1);
 await page.waitForFunction(()=>document.querySelector('#run-mascot').dataset.state==='completed');
 assert.equal(await page.locator('[data-mascot-label]').textContent(),'Completed');
 const shirt=await page.locator('#run-mascot').evaluate(root=>getComputedStyle([...root.querySelectorAll('path')].find(p=>p.getAttribute('fill').includes('--shirt-main'))).fill);
 assert.equal(shirt,'rgb(57, 182, 93)');
 await page.screenshot({path:'.local/runner-carlton-completed.png',fullPage:true});
 assert.match(await page.locator('#email-preview').innerText(),/Actual work/);
 await page.getByText('Edit email notes and next steps',{exact:true}).click();
 await page.locator('#email-editor textarea').first().fill('Edited for the email only.');
 await page.locator('#copy-daily-email').click();await page.waitForFunction(()=>Boolean(window.copied));assert.match(await page.evaluate(()=>window.copied),/Edited for the email only/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-state')).actions.filter(a=>a==='savePreparedTime').length),1);
 await page.goto('https://helper.test/history.html');await page.waitForFunction(()=>document.querySelectorAll('#runs article').length===1);await page.getByRole('tab',{name:'Daily Reports',exact:true}).click();
 assert.match(await page.locator('#totals').textContent(),/Billable 0.25 h/);
 assert.match(await page.locator('#preview').innerText(),/Edited for the email only/);
 await page.screenshot({path:'.local/workflow-history-preview.png',fullPage:true});
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});


