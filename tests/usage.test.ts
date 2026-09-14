import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {generateApp,mergeGenerated} from '../src/lib/generate';
import {changeLedger,usageSummary} from '../src/lib/usage-store';
test('changed-file output preserves unchanged files and schema',()=>{
 const files=[{path:'index.html',content:'<h1>Keep</h1>'},{path:'styles.css',content:'old'}];
 const result=mergeGenerated({name:'App',summary:'Color change',files:[{path:'styles.css',content:'new'}],sql:null},files,'keep SQL');
 assert.equal(result.files.find(f=>f.path==='index.html')?.content,'<h1>Keep</h1>');assert.equal(result.sql,'keep SQL');
 assert.throws(()=>mergeGenerated({name:'App',summary:'bad',files:[],sql:null},[],''));
});
test('generation records actual usage, reuses completed calls, caps spend and retains failures',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'studio-usage-test-'));const previous=process.env.STUDIO_USAGE_DIR;process.env.STUDIO_USAGE_DIR=dir;
 const original=globalThis.fetch;let calls=0;let status='completed';let output=JSON.stringify({name:'Test app',summary:'Test',files:[{path:'index.html',content:'<h1>Test</h1>'}],sql:''});
 globalThis.fetch=async()=>{calls++;return Response.json({id:'resp_test',object:'response',created_at:1,status,output:[{type:'message',role:'assistant',id:'msg_test',status:'completed',content:[{type:'output_text',text:output,annotations:[]}]}],usage:{input_tokens:100,cached_tokens:0,output_tokens:50,total_tokens:150,input_tokens_details:{cached_tokens:40},output_tokens_details:{reasoning_tokens:10}}})};
 const key='test-secret-not-real';const requestId=randomUUID();const projectId=randomUUID();
 try{
 const result=await generateApp(key,'Build a small app','App',[],false,{requestId,projectId});assert.equal(result.tokens,150);
 const again=await generateApp(key,'Build a small app','App',[],false,{requestId,projectId});assert.equal(again.reused,true);assert.equal(calls,1);
 await generateApp(key,'Build a small app','App',[],false,{requestId:randomUUID(),projectId});assert.equal(calls,1);
 await assert.rejects(generateApp(key,'Different request','App',[],false,{requestId,projectId}),/different request/);assert.equal(calls,1);
 let summary=await usageSummary(key);assert.equal(summary.today.total,150);assert.equal(summary.today.cachedInput,40);assert.equal(summary.today.output,50);assert.equal(summary.today.reasoning,10);assert.equal(summary.entries[0].reused,2);
 status='incomplete';await assert.rejects(generateApp(key,'A second build','App',[],false,{projectId}),/did not finish/);assert.equal(calls,2);summary=await usageSummary(key);assert.equal(summary.today.total,300);assert.equal(summary.entries[0].status,'failed');
 globalThis.fetch=async()=>{calls++;throw new TypeError('network failure')};await assert.rejects(generateApp(key,'A third build','App',[],false,{projectId}),/Check Usage/);summary=await usageSummary(key);assert.equal(summary.entries[0].status,'uncertain');assert.ok(summary.reserved>0);
 await changeLedger(key,d=>{d.limits.dailyTokens=1000});const before=calls;await assert.rejects(generateApp(key,'Over budget','App',[],false,{projectId}),/budget/);assert.equal(calls,before);
 const sub=(await readdir(dir))[0];const bytes=await readFile(path.join(dir,sub,'ledger.enc'));assert.ok(!bytes.includes(Buffer.from(key)));assert.ok(!bytes.includes(Buffer.from('Test app')));
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=previous;await rm(dir,{recursive:true,force:true})}
});
test('concurrent submissions issue only one provider call',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'studio-lock-test-'));const old=process.env.STUDIO_USAGE_DIR;process.env.STUDIO_USAGE_DIR=dir;const original=globalThis.fetch;let release!:()=>void;let reached!:()=>void;const entered=new Promise<void>(r=>reached=r);const hold=new Promise<void>(r=>release=r);let calls=0;
 globalThis.fetch=async()=>{calls++;reached();await hold;return Response.json({id:'r',object:'response',status:'completed',output:[{id:'m',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({name:'App',summary:'ok',files:[{path:'index.html',content:'ok'}],sql:''}),annotations:[]}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}})};
 try{const first=generateApp('concurrent-test-key','Build one','App',[],false);await entered;await assert.rejects(generateApp('concurrent-test-key','Build two','App',[],false),/already running/);release();await first;assert.equal(calls,1)}finally{release();globalThis.fetch=original;if(old===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=old;await rm(dir,{recursive:true,force:true})}
});
test('image references reach vision input and change the duplicate-request fingerprint',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'studio-image-test-'));const old=process.env.STUDIO_USAGE_DIR;process.env.STUDIO_USAGE_DIR=dir;const original=globalThis.fetch;let calls=0;let sent:any;
 globalThis.fetch=async(_url,init)=>{calls++;sent=JSON.parse(String(init?.body));return Response.json({id:'r',object:'response',status:'completed',output:[{id:'m',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({name:'App',summary:'ok',files:[{path:'index.html',content:'ok'}],sql:''}),annotations:[]}]}],usage:{input_tokens:500,output_tokens:1,total_tokens:501}})};
 try{const options={projectId:randomUUID(),images:[{name:'screen.jpg',dataUrl:'data:image/jpeg;base64,/9j/AA=='}]};await generateApp('image-test-key','Match this design','App',[],false,options);assert.equal(sent.input[1].content[1].type,'input_image');assert.equal(sent.input[1].content[1].image_url,options.images[0].dataUrl);assert.equal(sent.input[1].content[1].detail,'high');await generateApp('image-test-key','Match this design','App',[],false,options);assert.equal(calls,1);await generateApp('image-test-key','Match this design','App',[],false,{...options,images:[{name:'screen.jpg',dataUrl:'data:image/jpeg;base64,/9j/AB=='}]});assert.equal(calls,2);await assert.rejects(generateApp('image-test-key','Match this design','App',[],false,{...options,images:[{name:'bad.svg',dataUrl:'data:image/svg+xml;base64,AAAA'}]}));assert.equal(calls,2);
 }finally{globalThis.fetch=original;if(old===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=old;await rm(dir,{recursive:true,force:true})}
});
