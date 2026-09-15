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
 await changeLedger(key,d=>{d.limits.dailyTokens=1000});const before=calls;await assert.rejects(generateApp(key,'Over budget','App',[],false,{projectId}),/Check Usage/);assert.equal(calls,before+1);
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
test('patch generation preserves source and records rejected code cost without a second provider call',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'studio-patch-test-'));const old=process.env.STUDIO_USAGE_DIR;process.env.STUDIO_USAGE_DIR=dir;const original=globalThis.fetch;let calls=0;let bad=false;
 const files=[{path:'index.html',content:'<h1>Hello</h1>'},{path:'app.js',content:'const value=1;'}];
 globalThis.fetch=async(_url,init)=>{calls++;const request=JSON.parse(String(init?.body));assert.equal(request.text.format.schema.properties.files.items.properties.path.maxLength,180);return Response.json({id:'r',object:'response',status:'completed',output:[{id:'m',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({name:'App',summary:'Patched',files:[],patches:[{path:'app.js',find:'const value=1;',replace:bad?'const = ;':'const value=2;'}],sql:null}),annotations:[]}]}],usage:{input_tokens:100,output_tokens:100,total_tokens:200}})};
 try{const result=await generateApp('patch-key','Update the interaction value','App',files,false,{previousSql:'keep schema'});assert.equal(result.files.find(f=>f.path==='app.js')?.content,'const value=2;');assert.equal(result.files[0].content,files[0].content);assert.equal(result.sql,'keep schema');bad=true;await assert.rejects(generateApp('patch-key','Update another interaction value','App',files,false),/Code verification failed/);assert.equal(calls,2);const history=await usageSummary('patch-key');assert.equal(history.entries[0].status,'failed');assert.ok(history.entries[0].costUsd!>0);assert.equal(files[1].content,'const value=1;');}finally{globalThis.fetch=original;if(old===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=old;await rm(dir,{recursive:true,force:true})}
});
test('blank project estimate is free and guest build accepts an empty initial file list',async()=>{
 const {POST:estimate}=await import('../src/app/api/estimate/route');const {POST:build}=await import('../src/app/api/build/route');
 const dir=await mkdtemp(path.join(tmpdir(),'studio-first-build-'));const old=process.env.STUDIO_USAGE_DIR;process.env.STUDIO_USAGE_DIR=dir;const original=globalThis.fetch;let calls=0;
 const body={prompt:'Build a small website',name:'App',files:[],connected:false,requestId:randomUUID(),projectId:randomUUID()};const request=(path:string)=>new Request('http://localhost:3000'+path,{method:'POST',headers:{Origin:'http://localhost:3000',Cookie:'studio_openai=blank-project-test-key','Content-Type':'application/json'},body:JSON.stringify(body)});
 globalThis.fetch=async()=>{calls++;return Response.json({id:'r',object:'response',status:'completed',output:[{id:'m',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({name:'App',summary:'Built',files:[{path:'index.html',content:'<h1>Hello</h1>'}],patches:[],sql:''}),annotations:[]}]}],usage:{input_tokens:100,output_tokens:100,total_tokens:200}})};
 try{const quote=await estimate(request('/api/estimate'));assert.equal(quote.status,200,await quote.text());assert.equal(calls,0);const created=await build(request('/api/build'));assert.equal(created.status,200,await created.text());assert.equal(calls,1);}finally{globalThis.fetch=original;if(old===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=old;await rm(dir,{recursive:true,force:true})}
});
