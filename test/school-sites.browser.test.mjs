import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{}
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
test('Site arrow opens picker; exact underlined school link commits and populates address',{skip:process.env.CW_BROWSER_TEST!=='1'||!chromium},async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{const page=await browser.newPage();await page.setContent('<div><div><div><input class="cw_companyViewCompanyAddress" value="Old Site"></div></div><div id="site-arrow">▼</div></div><input class="cw_company" value="Democracy Prep Public Schools"><input id="address"><div id="AddressPickerList-listview-scroller" hidden><table><tr><td><a class="cw-ml-clickable-cell">Democracy Prep Endurance High School</a></td></tr></table></div>');
 await page.evaluate(()=>{window.selects=0;document.getElementById('site-arrow').onclick=()=>document.getElementById('AddressPickerList-listview-scroller').hidden=false;document.querySelector('a').onclick=()=>{window.selects++;document.querySelector('input').value='Democracy Prep Endurance High School';document.getElementById('address').value='1000 Westchester Ave';document.getElementById('AddressPickerList-listview-scroller').hidden=true;};});
 const chrome={runtime:{onMessage:{addListener(){}}},scripting:{executeScript:async({func,args=[]})=>[{frameId:0,result:await page.evaluate(({code,args})=>(0,eval)('('+code+')')(...args),{code:func.toString(),args})}]}};
 await runInNewContext(source+';selectSchoolSite(1,0,"Democracy Prep Endurance High School")',{chrome,setTimeout});
 assert.equal(await page.locator('input').first().inputValue(),'Democracy Prep Endurance High School');assert.equal(await page.locator('#address').inputValue(),'1000 Westchester Ave');assert.equal(await page.evaluate(()=>window.selects),1);
 }finally{await browser.close();}
});
