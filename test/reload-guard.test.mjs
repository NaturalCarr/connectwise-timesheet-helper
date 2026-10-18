import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
function context(blocked){let listener;const calls=[];return {calls,chrome:{runtime:{onMessage:{addListener(){}}},debugger:{onEvent:{addListener(fn){listener=fn},removeListener(){calls.push('listener removed')}},async detach(){calls.push('detach')},async sendCommand(_target,method,params){calls.push(method);if(method==='Page.reload')queueMicrotask(()=>listener({tabId:7},blocked?'Page.javascriptDialogOpening':'Page.frameNavigated',blocked?{type:'beforeunload'}:{frame:{id:'main'}}));if(method==='Page.handleJavaScriptDialog')assert.equal(params.accept,false);}}},setTimeout,clearTimeout};}
test('post-save reload cancels unsaved-changes dialog and releases browser input',async()=>{
 const ctx=context(true);
 await assert.rejects(runInNewContext(`${source}\nconnectwiseTab=async()=>{};attachConnectWiseDebugger=async()=>null;reloadConnectWiseSafely(7);`,ctx),/Reload was cancelled to preserve/);
 assert.equal(ctx.calls.filter(c=>c==='Page.reload').length,1);assert.ok(ctx.calls.includes('Page.handleJavaScriptDialog'));assert.ok(ctx.calls.includes('detach'));
});
test('clean reload finishes after main-frame navigation and releases listener',async()=>{
 const ctx=context(false);await runInNewContext(`${source}\nconnectwiseTab=async()=>{};attachConnectWiseDebugger=async()=>null;reloadConnectWiseSafely(7);`,ctx);assert.ok(ctx.calls.includes('listener removed'));assert.ok(ctx.calls.includes('detach'));
});
test('status mismatch readback never reloads the page',async()=>{
 const result=await runInNewContext(`${source}\nconnectwiseTab=async()=>{};matchingFrame=async()=>({state:{status:'Scheduled Remote~'}});verifyTicketStatusInTab({tabId:7,ticketId:123,status:'Completed'});`,{chrome:{runtime:{onMessage:{addListener(){}}}},setTimeout:fn=>fn()});
 assert.equal(result.verified,false);assert.equal(result.status,'Scheduled Remote~');
});
