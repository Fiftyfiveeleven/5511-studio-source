import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {beginUsage,changeLedger,usageSummary,type StoredEntry} from '../src/lib/usage-store';
test('shared encrypted ledger resolves racing reservations and fails closed on database errors',async()=>{
 const names=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','VERCEL'];
 const old=Object.fromEntries(names.map(n=>[n,process.env[n]])),fetch=globalThis.fetch;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='server-secret-test';process.env.VERCEL='1';
 let row:any=null,failed=false;
 globalThis.fetch=async(input,init)=>{
  if(failed)return Response.json({message:'Unavailable'},{status:503});
  const url=new URL(String(input));const method=init?.method||'GET';
  if(method==='GET')return Response.json(row?{version:row.version,ciphertext:row.ciphertext}:null);
  const next=JSON.parse(String(init?.body));
  if(method==='POST'){if(row)return Response.json({code:'23505'},{status:409});row=next;return new Response(null,{status:201});}
  if(method==='PATCH'){if(url.searchParams.get('version')!==`eq.${row.version}`)return Response.json([]);row={...row,...next};return Response.json([{id:row.id}]);}
  throw new Error('Unexpected request');
 };
 try{
  const key='openai-test-secret';
  const entry=():StoredEntry=>({id:randomUUID(),digest:randomUUID(),createdAt:new Date().toISOString(),status:'running',reservation:100,model:'test',projectId:randomUUID(),prompt:'Private prompt',reused:0} as StoredEntry);
  const results=await Promise.allSettled([beginUsage(key,entry()),beginUsage(key,entry())]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(String((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason),/already running/);
  assert.ok(!JSON.stringify(row).includes(key));assert.ok(!JSON.stringify(row).includes('Private prompt'));
  const summary=await usageSummary(key);assert.equal(summary.entries.length,1);assert.equal(summary.reserved,100);
  await Promise.all([changeLedger(key,d=>{d.entries[0].reused++}),changeLedger(key,d=>{d.entries[0].reused++})]);
  assert.equal((await usageSummary(key)).entries[0].reused,2);
  failed=true;await assert.rejects(beginUsage(key,entry()),/unavailable/);
  delete process.env.SUPABASE_SECRET_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await assert.rejects(beginUsage(key,entry()),/durable usage storage/);
 }finally{globalThis.fetch=fetch;for(const n of names){if(old[n]===undefined)delete process.env[n];else process.env[n]=old[n]}}
});
