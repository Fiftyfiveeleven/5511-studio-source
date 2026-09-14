import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceStatus} from '../src/lib/workspace-status';
test('workspace status distinguishes missing keys, live services and failed checks without exposing secrets or writing data',async()=>{
 const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','VERCEL'];const old=Object.fromEntries(names.map(n=>[n,process.env[n]])),original=globalThis.fetch;
 try{
  names.forEach(n=>delete process.env[n]);process.env.VERCEL='1';let status=await workspaceStatus();assert.equal(status.database.state,'missing');assert.equal(status.usage.state,'missing');
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='public-test';let failure=false,publicBucket=false;const requests:string[]=[];
  globalThis.fetch=async(input,init)=>{requests.push(String(input));assert.ok(['GET','HEAD'].includes(init?.method??'GET'));if(failure)throw new Error('secret-error-do-not-expose');return init?.method==='HEAD'?new Response(null,{status:200}):Response.json({id:'studio-projects',name:'studio-projects',public:publicBucket});};
  status=await workspaceStatus();assert.equal(status.database.state,'unverified');assert.equal(status.storage.state,'unverified');assert.equal(status.usage.state,'missing');
  process.env.SUPABASE_SECRET_KEY='private-test-secret';status=await workspaceStatus();assert.equal(status.database.state,'ready');assert.equal(status.storage.state,'ready');assert.equal(status.usage.state,'ready');assert.ok(requests.some(r=>r.includes('studio_usage_ledgers')));assert.ok(!JSON.stringify(status).includes('private-test-secret'));
  publicBucket=true;assert.equal((await workspaceStatus()).storage.state,'error');failure=true;status=await workspaceStatus();assert.equal(status.database.state,'error');assert.equal(status.usage.state,'error');assert.ok(!JSON.stringify(status).includes('secret-error'));
 }finally{globalThis.fetch=original;for(const n of names){if(old[n]===undefined)delete process.env[n];else process.env[n]=old[n]}}
});
