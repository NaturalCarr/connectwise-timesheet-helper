import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{}
test('Resources backlog search protects global filters and waits for fresh rows',{skip:process.env.CW_BROWSER_TEST!=='1'||!chromium},async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
 const page=await browser.newPage();
 await page.setContent(`<input id="global-input" value="View All"><table><tr><td><input id="ResourceList-input"><input id="SR_Service_RecID-input"><input id="Summary-input" value="stale"></td></tr></table><button class="cw-toolbar-search">Search</button><div id="srboard-listview-scroller"><table><tbody><tr>${['','1','','','Working Issue Now','Natural Carr','T-123','','Example Company','',''].map(x=>'<td>'+x+'</td>').join('')}</tr></tbody></table></div><table><tr><td><span>1 - 1 of 1</span></td><td><button><svg width="10" height="10"></svg></button></td></tr></table>`);
 await page.addScriptTag({content:readFileSync(new URL('../extension/rake-backlog.js',import.meta.url),'utf8')});
 await page.evaluate(()=>searchRakeBoard('*example*'));
 assert.equal(await page.locator('#global-input').inputValue(),'View All');assert.equal(await page.locator('#Summary-input').inputValue(),'');assert.equal(await page.locator('#ResourceList-input').inputValue(),'*example*');
 assert.equal((await page.evaluate(()=>inspectRakeBoard('*example*'))).ready,false);
 await page.evaluate(()=>document.querySelector('#srboard-listview-scroller td:nth-child(5)').textContent='Closed');
 await page.waitForFunction(()=>window.__cwRakeRead.changed);
 let state=await page.evaluate(()=>inspectRakeBoard('*example*'));assert.equal(state.ready,true);assert.equal(state.rows[0].closed,true);assert.equal(state.rows[0].ticketId,1);
 await page.evaluate(()=>searchRakeBoard('*example*'));
 assert.equal((await page.evaluate(()=>inspectRakeBoard('*example*'))).ready,true,'identical valid search must not wait for nonexistent row changes');
 await page.evaluate(()=>{
 const old=document.querySelector('span');old.closest('table').outerHTML='<div id="pager"><div class="cw-ml-pgopt-count">1 - 1 of 2</div><div class="nextButton"><div class="mm_button" tabindex="0">Next</div></div></div>';
 document.querySelector('.nextButton .mm_button').onclick=()=>{document.querySelector('.cw-ml-pgopt-count').textContent='2 - 2 of 2';document.querySelector('#srboard-listview-scroller td:nth-child(2)').textContent='2';};
 });
 await page.evaluate(()=>advanceRakeBoard(1));await page.waitForFunction(()=>window.__cwRakeRead.changed);
 state=await page.evaluate(()=>inspectRakeBoard('*example*'));assert.equal(state.start,2);assert.equal(state.rows[0].ticketId,2);
 await assert.rejects(page.evaluate(()=>advanceRakeBoard(2)),/changed before Next/);
 await page.evaluate(()=>document.querySelector('#ResourceList-input').value='changed');await assert.rejects(page.evaluate(()=>inspectRakeBoard('*example*')),/filter changed/);
 await page.evaluate(()=>{document.querySelector('#ResourceList-input').value='*example*';document.querySelector('#srboard-listview-scroller tr').remove();});
 assert.equal((await page.evaluate(()=>inspectRakeBoard('*example*'))).ready,false);
 }finally{await browser.close();}
});
