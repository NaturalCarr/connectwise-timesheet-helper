export const RUN_LOCK = 'connectwise-helper-browser-run';
export async function checkBackground(runtime, timeoutMs = 5000) {
 let timer;
 try {
  const result = await Promise.race([runtime.sendMessage({action:'helperHealth'}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Helper background did not respond. Close other runner tabs, reload the extension, then reopen this saved run. No browser action was sent by this check.')),timeoutMs);})]);
  if(!result?.ok) throw new Error('Helper background health check failed. Reload the extension and reopen this saved run.');
  if(result.pending) throw new Error('The helper background still has '+result.pending+' action(s) pending'+(result.action?' ('+result.action+')':'')+'. Close runner tabs and reload the extension before resuming. An earlier action may have taken effect.');
  return result;
 } finally {clearTimeout(timer);}
}
export async function recoverInterruptedRuns(locks,storage) {
 return locks.request(RUN_LOCK,{ifAvailable:true},async lock=>{
  if(!lock)return 0;
  const data=await storage.get(null),updates={};
  for(const [key,run] of Object.entries(data))if(key.startsWith('runHistory:')&&run.state==='running')updates[key]={...run,state:'stopped',interruption:'Runner ended before completion. Saved evidence is retained; Resume checks uncertain work.',updatedAt:new Date().toISOString()};
  if(Object.keys(updates).length)await storage.set(updates);
  return Object.keys(updates).length;
 });
}
