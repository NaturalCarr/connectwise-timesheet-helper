import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseConnectWiseTab} from '../extension/navigation.mjs';

test('closed configured tabs recover only to valid saved or unambiguous CW tabs', async()=>{
 const old=globalThis.chrome;
 let saved=9,tabs=[{id:9,url:'https://na.myconnectwise.net/v2025_1/ConnectWise.aspx'}];
 globalThis.chrome={tabs:{get:async id=>{const tab=tabs.find(t=>t.id===id);if(!tab)throw Error('No tab with id: '+id);return tab;},query:async()=>tabs},storage:{local:{get:async()=>({connectwiseTabId:saved})}}};
 try{
  const params=new URLSearchParams({tabId:'7'});
  assert.equal(await chooseConnectWiseTab(params),9);
  saved=7;assert.equal(await chooseConnectWiseTab(params),9);
  tabs.push({id:10,url:'https://na.myconnectwise.net/v2025_1/ConnectWise.aspx'});
  await assert.rejects(chooseConnectWiseTab(params),/Found 2 ConnectWise tabs/);
  assert.equal(await chooseConnectWiseTab(new URLSearchParams({tabId:'10'})),10);
  tabs.push({id:11,url:'https://example.com/'});
  await assert.rejects(chooseConnectWiseTab(new URLSearchParams({tabId:'11'})),/not ConnectWise/);
 }finally{globalThis.chrome=old;}
});
