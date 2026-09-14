import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileProjectJobs,enqueueError} from '../src/lib/job-recovery';

test('terminal worker releases stuck job; active and unreachable workers stay protected',async()=>{
 const oldFetch=globalThis.fetch;
 const names=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY'];
 const old=names.map(n=>process.env[n]);
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://abcdefghijklmnopqrst.supabase.co';process.env.SUPABASE_SECRET_KEY='test-key';
 let updates=0,deletes=0;let race=false;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(init?.method==='PATCH'){
   assert.equal(url.searchParams.get('status'),'in.(queued,running)');
   assert.equal(JSON.parse(String(init.body)).status,'failed');updates++;
   return Response.json(race?[]:[{id:'job'}]);
  }
  if(init?.method==='DELETE'){deletes++;return new Response(null,{status:204});}
  return Response.json([{id:'job',workflow_id:'run'}]);
 };
 try{
  await reconcileProjectJobs('project',async()=> 'running');
  await reconcileProjectJobs('project',async()=>{throw new Error('temporary outage');});
  assert.equal(updates,0);assert.equal(deletes,0);
  await reconcileProjectJobs('project',async()=> 'failed');
  assert.equal(updates,1);assert.equal(deletes,1);
  race=true;
  await reconcileProjectJobs('project',async()=> 'completed');
  assert.equal(updates,2);assert.equal(deletes,1,'do not remove credentials if terminal state was already saved concurrently');
 }finally{globalThis.fetch=oldFetch;names.forEach((n,i)=>{if(old[i]===undefined)delete process.env[n];else process.env[n]=old[i]});}
});
test('enqueue errors distinguish active project, daily limit, and storage',()=>{
 assert.equal(enqueueError({code:'23505'}).status,409);
 assert.equal(enqueueError({message:'Background job limit reached'}).status,429);
 assert.equal(enqueueError({code:'PGRST202'}).status,503);
});
