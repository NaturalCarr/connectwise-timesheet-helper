import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{}
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const activate=runInNewContext(source+';activateExactTicketStatus',{chrome:{runtime:{onMessage:{addListener(){}}}}});
const inspect=runInNewContext(source+';inspectSelectedTicketOption',{chrome:{runtime:{onMessage:{addListener(){}}}}});
test('exact Status option commits a scrolled picker without coordinate input',{skip:process.env.CW_BROWSER_TEST!=='1'||!chromium},async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{const page=await browser.newPage();
 const fixture=async()=>{await page.setContent('<h3>Service Ticket #1766660 - Fixture</h3><table><tr><td>Status:</td><td><input class="cw_status" value="Working Issue Now"></td></tr></table><div class="gwt-dropdown-options" style="height:100px;overflow:auto"><div class="mm_label" style="height:200px">Working Issue Now</div><div class="mm_label"><div>Completed~</div></div></div>');await page.evaluate(()=>{document.querySelector('.gwt-dropdown-options').onmousedown=event=>{if(event.target.parentElement?.classList.contains('mm_label') && event.target.textContent==='Completed~'){document.querySelector('input').value='Completed~';document.querySelector('.gwt-dropdown-options').remove();}};});};
 await fixture();await page.evaluate(({code})=>(0,eval)('('+code+')')('1766660','Completed'),{code:activate.toString()});
 assert.equal((await page.evaluate(({code})=>(0,eval)('('+code+')')('ticket-status','Completed'),{code:inspect.toString()})).verified,true);
 await fixture();await assert.rejects(page.evaluate(({code})=>(0,eval)('('+code+')')('999','Completed'),{code:activate.toString()}),/identity changed/);assert.equal(await page.locator('input').inputValue(),'Working Issue Now');
 await page.evaluate(()=>document.querySelector('.gwt-dropdown-options').insertAdjacentHTML('beforeend','<div class="mm_label">Completed~</div>'));
 await assert.rejects(page.evaluate(({code})=>(0,eval)('('+code+')')('1766660','Completed'),{code:activate.toString()}),/one exact/);assert.equal(await page.locator('input').inputValue(),'Working Issue Now');
 }finally{await browser.close();}
});
