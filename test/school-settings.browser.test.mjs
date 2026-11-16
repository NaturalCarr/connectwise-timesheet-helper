import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{}
test('school settings add, edit, persist and remove mappings',{skip:process.env.CW_BROWSER_TEST!=='1'||!chromium},async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});try{
 const page=await browser.newPage();await page.route('https://helper.test/**',route=>{const name=new URL(route.request().url()).pathname.slice(1);return route.fulfill({body:readFileSync(new URL('../extension/'+name,import.meta.url)),contentType:name.endsWith('html')?'text/html':name.endsWith('json')?'application/json':'text/javascript'});});
 await page.addInitScript(()=>{window.chrome={runtime:{getURL:p=>'https://helper.test/'+p,getManifest:()=>({version:'test'})},storage:{local:{get:async k=>{const s=JSON.parse(localStorage.getItem('settings-fixture')||'{}');return {[k]:s[k]};},set:async v=>localStorage.setItem('settings-fixture',JSON.stringify({...JSON.parse(localStorage.getItem('settings-fixture')||'{}'),...v}))}}};});
 await page.goto('https://helper.test/settings.html');await page.locator('input[name=company]').waitFor();
 assert.equal(await page.locator('.school-row').count(),0);await page.locator('#add-school').click();await page.locator('[data-key=acronym]').fill('SCH');await page.locator('[data-key=site]').fill('North Campus');await page.locator('button').filter({hasText:'Save configuration'}).click();await page.reload();await page.locator('[data-key=site]').waitFor();assert.equal(await page.locator('[data-key=site]').inputValue(),'North Campus');
 await page.locator('[data-key=site]').fill('East Campus');await page.locator('button').filter({hasText:'Save configuration'}).click();await page.reload();await page.locator('[data-key=site]').waitFor();assert.equal(await page.locator('[data-key=site]').inputValue(),'East Campus');
 await page.locator('button').filter({hasText:'Remove'}).click();await page.locator('button').filter({hasText:'Save configuration'}).click();await page.reload();await page.locator('input[name=company]').waitFor();assert.equal(await page.locator('.school-row').count(),0);
 }finally{await browser.close();}
});
