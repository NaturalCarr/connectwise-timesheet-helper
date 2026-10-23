import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{}
test('main screen keeps owner visible, collapses ticket form and toggles JSON beside primary action',{skip:process.env.CW_BROWSER_TEST!=='1'||!chromium},async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:560,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://helper.test/**',route=>{const name=new URL(route.request().url()).pathname.slice(1);try{route.fulfill({body:readFileSync(new URL('../extension/'+name,import.meta.url)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.json')?'application/json':name.endsWith('.css')?'text/css':'text/javascript'});}catch{route.fulfill({status:404});}});
  await page.addInitScript(()=>{
   const get=()=>JSON.parse(localStorage.getItem('test-store')||'{"helperSettings:ticketOwner":"Example Engineer"}');
   window.opened=[];window.chrome={storage:{local:{get:async keys=>{const values=get();return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,values[key]]));},set:async next=>localStorage.setItem('test-store',JSON.stringify({...get(),...next})),remove:async keys=>{const values=get();for(const key of Array.isArray(keys)?keys:[keys])delete values[key];localStorage.setItem('test-store',JSON.stringify(values));}}},runtime:{getURL:path=>'https://helper.test/'+path,sendMessage:async()=>({ok:true,version:'0.9.15',ticketSaveMethod:'exact-element'})},tabs:{create:async options=>window.opened.push(options),query:async()=>[]}};
  });
  await page.goto('https://helper.test/popup.html');await page.waitForFunction(()=>document.querySelector('#ticket-owner-setting').value==='Example Engineer');
  assert.equal(await page.locator('#owner-settings-form').isVisible(),true);assert.equal(await page.locator('#ticket-json-panel').isVisible(),false);
  const buttons=await page.locator('.ticket-actions button').evaluateAll(nodes=>nodes.map(n=>({type:n.type,top:n.getBoundingClientRect().top})));assert.equal(buttons.length,2);assert.equal(buttons[1].type,'button');assert.equal(buttons[0].top,buttons[1].top);
  await page.locator('#toggle-ticket-json').click();assert.equal(await page.locator('#ticket-json-panel').isVisible(),true);assert.equal(await page.locator('#toggle-ticket-json').getAttribute('aria-expanded'),'true');
  await page.locator('#ticket-json').fill(JSON.stringify({schemaVersion:'1.0',issue:'Printer connection',description:'User requested printing assistance.'}));await page.locator('#load-ticket-json').click();await page.waitForFunction(()=>document.querySelector('#ticket-status').textContent.startsWith('JSON loaded'));
  assert.equal(await page.locator('#ticket-issue').inputValue(),'Printer connection');assert.equal((await page.evaluate(()=>window.opened)).length,0);
  await page.screenshot({path:'.local/main-ui-service.png',fullPage:true});
  await page.locator('#toggle-ticket-json').click();assert.equal(await page.locator('#ticket-json-panel').isVisible(),false);await page.locator('#toggle-ticket-json').click();assert.match(await page.locator('#ticket-json').inputValue(),/Printer connection/);
  await page.locator('#ticket-section > summary').click();assert.equal(await page.locator('#ticket-form').isVisible(),false);assert.equal(await page.locator('#owner-settings-form').isVisible(),true);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('test-store'))['helperUi:ticket-section']===false);await page.reload();await page.waitForFunction(()=>document.querySelector('#ticket-section').open===false);assert.equal(await page.locator('#ticket-owner-setting').isVisible(),true);
  await page.screenshot({path:'.local/main-ui-overview.png',fullPage:true});
  await page.locator('#weekly-section > summary').click();await page.screenshot({path:'.local/main-ui-timesheets.png',fullPage:true});
  await page.locator('#open-workspace').click();assert.match((await page.evaluate(()=>window.opened))[0].url,/popup.html\?workspace=1/);
  await page.goto('https://helper.test/popup.html?workspace=1');await page.setViewportSize({width:390,height:850});await page.waitForFunction(()=>document.body.classList.contains('full-workspace'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
