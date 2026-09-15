import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submitChatBuild} from '../src/lib/chat-build';
import {budgetBlock} from '../src/lib/budget-check';
import {fullstackTemplate} from '../src/lib/fullstack-project';
import {defaultLimits} from '../src/lib/usage-types';
const project:any={id:'project',name:'Test',supabase_url:null};
const revision:any={id:'revision',files:fullstackTemplate(),sql:''};
test('routine chat edit checks limits and submits one stage without a planning dialog',async()=>{
 const calls:any[]=[];const images:any=[{name:'logo.png'}];
 const result=await submitChatBuild(project,revision,'Use the attached logo',images,async(path,method,body:any)=>{calls.push({path,body});return path==='/api/estimate'?{maxBuildUsd:2,remainingMonthUsd:20,reservedUsd:.4}:{id:'job'};});
 assert.equal(result.job.id,'job');assert.equal(calls.length,2);const plan=calls[1].body.plan;assert.equal(plan.stages.length,1);assert.equal(plan.baseRevision,'revision');assert.equal(plan.allowRepair,false);assert.deepEqual(calls[1].body.images,images);
});
test('budget block sends no build request and does not increase configured limits',async()=>{
 let calls=0;
 await assert.rejects(submitChatBuild(project,revision,'Use the logo',[],async()=>{calls++;return {blockedReason:'Daily allowance used'};}),/Daily allowance/);assert.equal(calls,1);
 await submitChatBuild(project,revision,'Use the logo',[],async()=>({maxBuildUsd:1,remainingMonthUsd:0,reservedUsd:200}));
});
test('usage preflight does not enforce legacy token or dollar caps',()=>{
 const now=Date.now();const usage:any={limits:{...defaultLimits,dailyTokens:1000},entries:[{createdAt:new Date(now-1000).toISOString(),usage:null,reservation:800}],monthUsd:0,monthReservedUsd:0};
 assert.equal(budgetBlock(usage,300,.1,now),null);
 assert.equal(budgetBlock(usage,200,.1,now),null);
 assert.equal(budgetBlock(usage,300,.1,now+86400000),null);
});
