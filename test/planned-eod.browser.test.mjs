import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {planDay} from '../extension/plan.mjs';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{}
test('JSON Daily Report opens and copies before any browser submission',{skip:process.env.CW_BROWSER_TEST!=='1'||!chromium},async()=>{
 const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));const plan=planDay(read('extension/DAILY-EXAMPLE.json'),{...read('ticket-settings.json'),owner:'Test Engineer'});
 const browser=await chromium.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://helper.test/**',route=>{const name=new URL(route.request().url()).pathname.slice(1);try{route.fulfill({body:readFileSync(new URL('../extension/'+name,import.meta.url)),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});}catch{route.fulfill({status:404});}});
 await page.addInitScript(plan=>{const values={'plannedEod:00000000-0000-0000-0000-000000000001':plan};window.actions=[];window.chrome={storage:{local:{get:async key=>Object.fromEntries((Array.isArray(key)?key:[key]).map(k=>[k,values[k]])),set:async data=>Object.assign(values,data)}},runtime:{sendMessage:async m=>{window.actions.push(m);throw Error('No browser action allowed');}}};Object.defineProperty(navigator,'clipboard',{value:{write:async items=>{window.copied=await(await items[0].getType('text/html')).text();}}});},plan);
 await page.goto('https://helper.test/planned-eod.html#00000000-0000-0000-0000-000000000001');await page.waitForFunction(()=>document.querySelector('#preview table'));
 assert.match(await page.locator('.notice').innerText(),/does not confirm ConnectWise saves/);
 await page.getByRole('button',{name:'Copy Daily Report to Clipboard',exact:true}).click();await page.waitForFunction(()=>window.copied);assert.match(await page.evaluate(()=>window.copied),/2 x M1, 1 x M4/);assert.equal((await page.evaluate(()=>window.actions)).length,0);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
