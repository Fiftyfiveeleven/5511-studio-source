import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildProjectWorkflow} from '../src/workflows/build-project';
import {sealJobCredential} from '../src/lib/job-store';
import {makeBuildPlan} from '../src/lib/project-memory';
test('worker saves staged progress, replays without extra AI calls, and stops cancelled work',async()=>{
 const names=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','STUDIO_JOB_ENCRYPTION_KEY','STUDIO_ALLOWED_EMAILS'];const before=Object.fromEntries(names.map(n=>[n,process.env[n]]));const fetchOriginal=globalThis.fetch;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://abcdefghijklmnopqrst.supabase.co';process.env.SUPABASE_SECRET_KEY='test-server-key';process.env.STUDIO_JOB_ENCRYPTION_KEY='aa'.repeat(32);delete process.env.STUDIO_ALLOWED_EMAILS;
 const project:any={id:randomUUID(),owner_id:randomUUID(),name:'Worker test',current_revision_id:null};const plan=makeBuildPlan('Build a working test page',true,true);plan.stages=plan.stages.slice(0,2);const job:any={id:plan.id,project_id:project.id,user_id:project.owner_id,status:'queued',plan,images:[],runtime:'browser',stage:0,expected_revision:null,cancel_requested:false};let secret:any={ciphertext:sealJobCredential('test-ai-key'),expires_at:new Date(Date.now()+3600000).toISOString()};let ledger:any=null;const revisions=new Map<string,any>();let providerCalls=0;
 globalThis.fetch=async(input,init)=>{const url=new URL(String(input));const body=init?.body?JSON.parse(String(init.body)):null;const method=init?.method??'GET';
 if(url.hostname==='api.openai.com'){providerCalls++;return Response.json({id:'resp',object:'response',status:'completed',output:[{id:'message',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({name:'Worker test',summary:'Saved stage',files:[{path:'index.html',content:'<h1>Stage '+providerCalls+'</h1>'}],patches:[],sql:''}),annotations:[]}]}],usage:{input_tokens:100,output_tokens:100,total_tokens:200}});}
 if(url.pathname.includes('/auth/v1/admin/users/'))return Response.json({user:{id:project.owner_id,email:'owner@test.example',email_confirmed_at:new Date().toISOString()}});
 const resource=url.pathname.split('/').at(-1);
 if(resource==='studio_usage_ledgers'){if(method==='GET')return Response.json(ledger);if(method==='POST'){ledger=body;return new Response(null,{status:201})}ledger={...ledger,...body};return Response.json([{id:ledger.id}]);}
 if(resource==='studio_build_jobs'){if(method==='GET')return Response.json({...job});Object.assign(job,body);return new Response(null,{status:204});}
 if(resource==='studio_job_secrets'){if(method==='DELETE'){secret=null;return new Response(null,{status:204})}return Response.json(secret);}
 if(resource==='projects')return Response.json({...project});
 if(resource==='revisions')return Response.json(revisions.get(url.searchParams.get('id')!.slice(3)));
 if(resource==='commit_studio_job'){assert.equal(body.p_expected,project.current_revision_id);const r={id:body.p_revision,files:body.p_files,sql:body.p_sql};revisions.set(r.id,r);project.current_revision_id=r.id;job.expected_revision=r.id;job.stage++;return Response.json(r.id);}
 throw new Error('Unexpected test request: '+url.pathname);
 };
 try{await buildProjectWorkflow(job.id);assert.equal(job.status,'completed',job.error);assert.equal(job.stage,2);assert.equal(providerCalls,2);assert.equal(revisions.size,2);assert.equal(secret,null);await buildProjectWorkflow(job.id);assert.equal(providerCalls,2);job.status='queued';job.stage=0;job.cancel_requested=true;await buildProjectWorkflow(job.id);assert.equal(job.status,'cancelled');assert.equal(providerCalls,2);}finally{globalThis.fetch=fetchOriginal;for(const n of names){if(before[n]===undefined)delete process.env[n];else process.env[n]=before[n]}}
});
