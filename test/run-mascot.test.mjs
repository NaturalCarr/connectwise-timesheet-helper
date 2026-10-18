import test from 'node:test';
import assert from 'node:assert/strict';
import {mascotState} from '../extension/run-mascot.mjs';
test('dancer reflects actual run states and only working can become stalled',()=>{
 assert.equal(mascotState('working',1000,2000).label,'Working...');
 assert.equal(mascotState('working',1000,91000).stalled,true);
 assert.equal(mascotState('working',1000,91000).label,'Stopped');
 assert.equal(mascotState('completed',1000,999999).label,'Completed');
 assert.equal(mascotState('stopped',1000,999999).stalled,false);
 assert.equal(mascotState('ready',1000,999999).label,'Ready');
});
