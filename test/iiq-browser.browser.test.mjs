import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{}
const source=readFileSync(new URL('../extension/iiq-browser.js',import.meta.url),'utf8');
const enabled=process.env.CW_BROWSER_TEST==='1'&&chromium;
const detail='/agent/tickets/11111111-1111-1111-1111-111111111111';
const dashboard=`<button data-testid="btn-global-search">Search</button><div id="search" hidden><input id="global-search-input"><div id="results"></div></div><script>document.querySelector('button').onclick=()=>document.getElementById('search').hidden=false;document.querySelector('input').onkeydown=e=>{if(e.key==='Enter')document.getElementById('results').innerHTML='<a href="${detail}"><span data-testid="label-entity-type">Ticket</span><span data-testid="label-primary">#T-123 - Copier ( Resolved )</span></a>';};</script>`;
const ticket=`<h2>Copier support</h2><div role="heading" aria-label="Ticket #T-123"><span data-testid="ticket-number">T-123</span></div><a role="button" ng-bind="$ctrl.GetTicketStatusText()">Resolved</a><button data-testid="btn-global-search">Search</button><div id="search" hidden><input id="global-search-input"><div id="results"></div></div><script>window.statusClicks=0;document.querySelector('a').onclick=()=>window.statusClicks++;document.querySelector('button').onclick=()=>document.getElementById('search').hidden=false;document.querySelector('input').onkeydown=e=>{if(e.key==='Enter')document.getElementById('results').innerHTML='<a href="${detail}"><span data-testid="label-entity-type">Ticket</span><span data-testid="label-primary">#T-123 - Copier ( Resolved )</span></a>';};</script>`;
test('IIQ reader uses rendered search and ticket status without touching status controls',{skip:!enabled},async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{const page=await browser.newPage();const requests=[];await page.route('**/*',route=>{requests.push(route.request().url());return route.fulfill({contentType:'text/html',body:route.request().url().includes(detail)?ticket:dashboard});});await page.goto('https://school.incidentiq.com/agent/dashboard');const session=await page.context().newCDPSession(page);
 const chrome={tabs:{get:async()=>({url:page.url()}),update:async(_id,options)=>{if(options.url)await page.goto(options.url);}},scripting:{executeScript:async({func,args=[]})=>[{result:await page.evaluate(({code,args})=>(0,eval)('('+code+')')(...args),{code:func.toString(),args})}]},debugger:{attach:async()=>{},detach:async()=>{},sendCommand:async(_target,method,args)=>session.send(method,args)}};
 const result=await runInNewContext(source+';readIiqStatusInTab({tabId:1,reference:"T-123"})',{chrome,setTimeout,URL});
 assert.equal(result.ok,true);assert.equal(result.reference,'T-123');assert.equal(result.status,'Resolved');assert.equal(await page.evaluate(()=>window.statusClicks),0);assert.equal(requests.some(url=>/api|graphql/i.test(url)),false);
 await session.detach();
 }finally{await browser.close();}
});
test('IIQ search rejects another numeric reference and multiple exact links',{skip:!enabled},async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});try{const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<input id="global-search-input" value="T-123"><a href="'+detail+'"><span data-testid="label-entity-type">Ticket</span><span data-testid="label-primary">#T-1234</span></a>'}));await page.goto('https://school.incidentiq.com/agent/dashboard');const read=()=>page.evaluate(({code})=>(0,eval)('('+code+')')('T-123'),{code:source.match(/function inspectIiqSearch[\s\S]*?(?=async function readIiqStatusInTab)/)[0]});assert.equal((await read()).verified,false);await page.locator('[data-testid="label-primary"]').evaluate(el=>el.textContent='#T-123');assert.equal((await read()).verified,true);await page.evaluate(()=>{const clone=document.querySelector('a').cloneNode(true);clone.href='/agent/tickets/22222222-2222-2222-2222-222222222222';document.body.append(clone);});await assert.rejects(read(),/multiple exact/);}finally{await browser.close();}
});
