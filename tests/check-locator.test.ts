import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkLocator} from '../src/lib/check-locator';
import {savedWithCheckWarning} from '../src/lib/build-display';
test('header/footer duplicates resolve only for navigation checks with one navigation match',async()=>{
 const all={count:async()=>2},nav={count:async()=>1};const page={locator:()=>all,getByRole:(role:string)=>{assert.equal(role,'navigation');return {locator:()=>nav}}};
 const step={action:'click',target:'a[href="/about"]'};
 assert.equal(await checkLocator(page,step,{id:'navigation',description:'Primary pages are reachable'}),nav);
 assert.equal(await checkLocator(page,step,{id:'footer',description:'Footer navigation'}),all);
 nav.count=async()=>2;assert.equal(await checkLocator(page,step,{id:'navigation',description:'Main navigation'}),all);
});
test('only fully saved, compiled builds with failed acceptance checks qualify as warnings',()=>{
 const job={status:'failed',stage:1,plan:{stages:[{}]},report:{compiled:true,errors:[],requirements:[{passed:false}]}};
 assert.equal(savedWithCheckWarning(job),true);
 assert.equal(savedWithCheckWarning({...job,stage:0}),false);
 assert.equal(savedWithCheckWarning({...job,report:{...job.report,compiled:false}}),false);
 assert.equal(savedWithCheckWarning({...job,report:{...job.report,errors:['crashed']}}),false);
});
test('the serialized sandbox runner clicks the navigation link and records the real result',async()=>{
 const {testRunner}=await import('../src/lib/runtime-sandbox');const {runInNewContext}=await import('node:vm');
 let clicked=false;let report:any;
 const locator={count:async()=>2,click:async()=>{throw new Error('ambiguous link')}};
 const nav={count:async()=>1,click:async()=>{clicked=true}};
 const page={setDefaultTimeout:()=>{},on:()=>{},locator:()=>locator,getByRole:()=>({locator:()=>nav}),goto:async()=>{},waitForURL:async(fn:any)=>{assert.equal(clicked,true);assert.equal(fn({pathname:'/about'}),true)}};
 const context={route:async()=>{},newPage:async()=>page,close:async()=>{}};
 const browser={newContext:async()=>context,close:async()=>{}};
 const fs={readFileSync:()=>JSON.stringify({requirements:[{id:'navigation',description:'Main navigation',steps:[{action:'click',target:'a[href="/about"]'},{action:'url',value:'/about'}]}]}),writeFileSync:(_p:string,data:string)=>{report=JSON.parse(data)}};
 await runInNewContext(testRunner,{require:(name:string)=>name==='fs'?fs:{chromium:{launch:async()=>browser}},console,process:{exit:()=>{throw new Error('runner failed')}}});
 assert.equal(clicked,true);assert.equal(report[0].passed,true);
});
