import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
test('title reference searches only Summary and accepts a different company/site row',()=>{
  class Input {
    constructor(id,value){this.id=id;this.value=value;}
    get value(){return this.v;} set value(v){this.v=v;}
    getBoundingClientRect(){return {width:100,height:20};}
    dispatchEvent(){}
  }
  const filters=[new Input('Summary-input',''),new Input('Company_Name-input','Old company'),new Input('Site_name-input','Old site'),new Input('Location-input','Old location'),new Input('SR_Service_RecID-input','123')];
  let searched=false;
  const clear={getBoundingClientRect:()=>({width:20,height:20}),click(){}};
  const row={children:['','8000014','','','','','IIQ Ticket Number T-90619','','Actual company','Actual site'].map(innerText=>({tagName:'TD',innerText}))};
  const document={body:{innerText:'View 1 - 1 of 1'},querySelectorAll(selector){
    if(selector==='input[id$="-input"]')return filters;
    if(selector==='.cw-toolbar-clear')return [clear];
    if(selector==='.cw-toolbar-search')return [{...clear,click(){searched=true;}}];
    if(selector==='tr')return [row];
    return filters.filter(input=>'#'+input.id===selector);
  },querySelector(selector){return filters.find(input=>'#'+input.id===selector);}};
  const ticket={titleContains:'T-90619',summary:'Unrelated issue',company:'Configured company',site:'Configured site'};
  class Event {constructor(type){this.type=type;}}
  const context={ticket,document,HTMLInputElement:Input,Event,InputEvent:Event,chrome:{runtime:{onMessage:{addListener(){}}}}};
  runInNewContext(`${source}\nsearchBoardForTicket(ticket);`,context);
  assert.equal(searched,true);
  assert.deepEqual(filters.map(input=>input.value),['*T-90619*','','','','']);
  const result=runInNewContext(`${source}\ninspectBoardSearch(ticket);`,context);
  assert.equal(result.ready,true);
  assert.equal(result.matches[0].ticketId,8000014);
});
