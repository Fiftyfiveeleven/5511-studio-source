import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {designElements,applyJsxDesignChange,instrumentJsx} from '../src/lib/design-source';
import {fullstackTemplate} from '../src/lib/fullstack-project';
import {validateArtifact} from '../src/lib/artifacts';
import {installKit,featureKits,validateFeature} from '../src/lib/feature-library';
import {mergeSources} from '../src/lib/github-merge';
import {pushGithub,exportGithubFiles} from '../src/lib/github';
import {readGithubSource} from '../src/lib/github-sync';
import {reviewDesign} from '../src/lib/design-review';
import {usageSummary,changeLedger} from '../src/lib/usage-store';
import {designBridge} from '../src/lib/design-bridge';
function jsxValid(content:string){const src=ts.createSourceFile('test.tsx',content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.equal((src as unknown as {parseDiagnostics:unknown[]}).parseDiagnostics.length,0);}
test('direct JSX edits preserve handlers, reject dynamic properties and safely encode user text',()=>{
 let files=fullstackTemplate().map(f=>f.path==='app/page.tsx'?{...f,content:`export default function Page(){const dynamic='Live';return <main><h1 style={{color:'#112233',margin:8,lineHeight:1.5}}>Welcome</h1><p>{dynamic}</p><a href="/about">About</a><img src="/photo.jpg" alt="Photo"/><button onClick={()=>alert('clicked')} style={styles}>Save</button></main>}`}:f);
 let elements=designElements(files),heading=elements.find(e=>e.tag==='h1')!;assert.equal(heading.text,'Welcome');
 files=applyJsxDesignChange(files,{id:heading.id,property:'text',value:'Hello <script>alert("x")</script> {user}'});jsxValid(files.find(f=>f.path==='app/page.tsx')!.content);assert.equal(designElements(files).find(e=>e.tag==='h1')!.text,'Hello <script>alert("x")</script> {user}');
 files=applyJsxDesignChange(files,{id:heading.id,property:'padding',value:'24px'});assert.equal(designElements(files).find(e=>e.tag==='h1')!.styles.color,'#112233');assert.match(files.find(f=>f.path==='app/page.tsx')!.content,/"margin":8/);assert.match(files.find(f=>f.path==='app/page.tsx')!.content,/"lineHeight":1.5/);
 elements=designElements(files);assert.throws(()=>applyJsxDesignChange(files,{id:elements.find(e=>e.tag==='p')!.id,property:'text',value:'Overwrite expression'}),/Dynamic/);
 assert.throws(()=>applyJsxDesignChange(files,{id:elements.find(e=>e.tag==='button')!.id,property:'color',value:'red'}),/dynamic styles/);
 const link=elements.find(e=>e.tag==='a')!;assert.throws(()=>applyJsxDesignChange(files,{id:link.id,property:'href',value:'javascript:alert(1)'}),/HTTPS/);
 files=applyJsxDesignChange(files,{id:link.id,property:'href',value:'/contact'});files=applyJsxDesignChange(files,{id:link.id,property:'href',value:'https://example.com'});assert.equal(designElements(files).find(e=>e.tag==='a')!.attributes.href,'https://example.com');
 const instrumented=instrumentJsx(files);assert.ok(instrumented.some(f=>f.content.includes('data-studio-element')));assert.ok(!files.some(f=>f.content.includes('data-studio-element')));jsxValid(instrumented.find(f=>f.path==='app/page.tsx')!.content);assert.match(files.find(f=>f.path==='app/page.tsx')!.content,/onClick=\{\(\)=>alert\('clicked'\)\}/);
 assert.doesNotThrow(()=>new Function(designBridge('test','https://studio.example')));
});
test('feature packs produce valid Next and browser source and refuse duplicate installation',()=>{
 for(const kit of featureKits){for(const source of [fullstackTemplate(),[{path:'index.html',content:'<!doctype html><html><head></head><body><h1>Original</h1></body></html>'}]]){const files=installKit(source,kit.id);validateArtifact({name:'Test',summary:'Test kit',files,sql:''});for(const file of files.filter(f=>f.path.endsWith('.tsx')))jsxValid(file.content);assert.throws(()=>installKit(files,kit.id),/already installed/);assert.ok(files.some(f=>f.content.includes('Original')||f.path==='app/page.tsx'));}}
 assert.throws(()=>validateFeature({id:randomUUID(),name:'Bad',description:'',created_at:new Date().toISOString(),files:[{path:'../../.env',content:'x'}],sql:''}));
});
test('three-way sync preserves independent edits and requires choices for modifications and deletions',()=>{
 const base=[{path:'a',content:'one'},{path:'b',content:'two'},{path:'deleted',content:'base'}],local=[{path:'a',content:'local'},{path:'b',content:'two'},{path:'deleted',content:'edit'}],remote=[{path:'a',content:'one'},{path:'b',content:'remote'}];
 const m=mergeSources(base,local,remote);assert.deepEqual(m.conflicts,['deleted']);assert.equal(m.files.find(f=>f.path==='a')?.content,'local');assert.equal(m.files.find(f=>f.path==='b')?.content,'remote');
 const resolved=mergeSources(base,local,remote,{deleted:'remote'});assert.equal(resolved.conflicts.length,0);assert.ok(!resolved.files.some(f=>f.path==='deleted'));
 assert.deepEqual(mergeSources([],[{path:'x',content:'mine'}],[{path:'x',content:'theirs'}]).conflicts,['x']);
 assert.equal(mergeSources(base,base,base).changes.length,0);
});
test('GitHub sync refuses changed heads and removes only obsolete managed files',async()=>{const original=globalThis.fetch,head='a'.repeat(40),projectId=randomUUID();const input={projectId,name:'Test',repository:'owner/repo',branch:'main',files:[{path:'index.html',content:'<html><body>Saved</body></html>'}],sql:'',url:null,key:null,expectedHead:head};const mutations:any[]=[];let legacy=false;
 try{globalThis.fetch=async(url,init)=>{const u=String(url);if(init?.method!=='GET'){mutations.push(JSON.parse(String(init?.body)));return Response.json({sha:'b'.repeat(40)})}if(u.endsWith('/owner/repo'))return Response.json({permissions:{push:true}});if(u.includes('/git/ref/'))return Response.json({object:{sha:head}});if(u.includes('/git/commits/'))return Response.json({tree:{sha:'tree'}});if(u.includes('/git/trees/'))return Response.json({tree:[{path:'.5511/project.json',sha:'marker',type:'blob'},{path:'source/components/old.js',sha:'old',type:'blob'},{path:'notes.txt',sha:'keep',type:'blob'}]});if(u.includes('/git/blobs/'))return Response.json({content:Buffer.from(JSON.stringify(legacy?{projectId}:{projectId,managedPaths:['source/components/old.js','.5511/project.json']})).toString('base64')});throw new Error(u)};
 await assert.rejects(pushGithub('fake',{...input,expectedHead:'c'.repeat(40)}),/changed since/);assert.equal(mutations.length,0);await assert.rejects(pushGithub('fake',{...input,expectedHead:null}),/Pull and review/);
 await pushGithub('fake',input);assert.deepEqual(mutations[0].tree.find((f:any)=>f.sha===null),{path:'source/components/old.js',mode:'100644',type:'blob',sha:null});assert.ok(!mutations[0].tree.some((f:any)=>f.path==='notes.txt'));assert.equal(mutations[2].force,false);assert.ok(!mutations[0].tree.some((f:any)=>f.path==='README.md'||f.path==='vercel.json'));legacy=true;mutations.length=0;await pushGithub('fake',input);assert.ok(mutations[0].tree.some((f:any)=>f.path==='source/components/old.js'&&f.sha===null));
 }finally{globalThis.fetch=original}});
test('GitHub reader uses commit trees, checks binding and only imports editable source',async()=>{const original=globalThis.fetch,projectId=randomUUID(),head='a'.repeat(40);let marker=projectId;const blobs:any={html:'<html><body><h1>Remote</h1></body></html>',sql:'-- reviewed later'};
 try{globalThis.fetch=async(url)=>{const u=String(url);if(u.includes('/git/ref/'))return Response.json({object:{sha:head}});if(u.includes('/git/commits/'))return Response.json({tree:{sha:'tree'}});if(u.includes('/git/trees/'))return Response.json({tree:[{path:'.5511/project.json',sha:'marker',mode:'100644',type:'blob',size:100},{path:'source/index.html',sha:'html',mode:'100644',type:'blob',size:50},{path:'schema.sql',sha:'sql',mode:'100644',type:'blob',size:20},{path:'.env',sha:'secret',mode:'100644',type:'blob',size:100}]});if(u.includes('/git/blobs/')){const id=u.split('/').pop()!;assert.notEqual(id,'secret');return Response.json({encoding:'base64',size:100,content:Buffer.from(id==='marker'?JSON.stringify({projectId:marker}):blobs[id]).toString('base64')});}throw new Error(u)};
 const result=await readGithubSource('fake','owner/repo','main',projectId);assert.equal(result.head,head);assert.deepEqual(result.files.map(f=>f.path),['index.html','schema.sql']);marker=randomUUID();await assert.rejects(readGithubSource('fake','owner/repo','main',projectId),/different Studio project/);
 }finally{globalThis.fetch=original}});
test('visual reviews account for usage, reuse identical reviews and retain failed attempts without retry',async()=>{const dir=await mkdtemp(join(tmpdir(),'studio-review-')),old=process.env.STUDIO_USAGE_DIR;process.env.STUDIO_USAGE_DIR=dir;const key='test-review-'+randomUUID();const input={requestId:randomUUID(),projectId:randomUUID(),name:'Test',brief:'Clear hierarchy',observations:'',images:[{name:'Current screenshot',dataUrl:'data:image/jpeg;base64,/9j/AAAA'}]};let calls=0;const client=()=>({responses:{create:async(body:any)=>{calls++;assert.equal(body.store,false);assert.ok(body.max_output_tokens<=4000);assert.equal(body.input[0].content[1].type,'input_image');return {status:'completed',output_text:JSON.stringify({summary:'Clear layout.',findings:[]}),usage:{input_tokens:100,output_tokens:50,total_tokens:150}}}}}) as any;
 try{await reviewDesign(key,input,client);await reviewDesign(key,{...input,requestId:randomUUID()},client);assert.equal(calls,1);const summary=await usageSummary(key);assert.equal(summary.today.total,150);assert.equal(summary.entries[0].status,'completed');assert.ok(summary.entries[0].costUsd!>0);
 await assert.rejects(reviewDesign(key,{...input,requestId:randomUUID(),brief:'Different'},()=>({responses:{create:async()=>{calls++;throw new Error('Network timeout')}}}) as any));assert.equal(calls,2);assert.equal((await usageSummary(key)).entries[0].status,'uncertain');
 await changeLedger(key,data=>{data.limits.monthlyUsd=0});await reviewDesign(key,{...input,requestId:randomUUID(),brief:'Legacy budget ignored'},client);assert.equal(calls,3);
 }finally{if(old===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=old;await rm(dir,{recursive:true,force:true})}});
test('cloud feature library is private and viewers cannot change project sync destinations',async()=>{const db=new PGlite(),owner=randomUUID(),other=randomUUID(),viewer=randomUUID(),project=randomUUID(),feature=randomUUID();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${owner}','owner@test.example',now()),('${other}','other@test.example',now()),('${viewer}','viewer@test.example',now());`);
 for(const file of ['schema.sql','migrations/20260912_project_access.sql','migrations/20260914184120_phase_two_tools.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
 await db.exec(`insert into projects(id,owner_id,name) values('${project}','${owner}','Private app');insert into project_access(project_id,email,role) values('${project}','viewer@test.example','viewer');set role authenticated;set request.jwt.claim.sub='${owner}';insert into studio_features(id,name,files) values('${feature}','Private blueprint','[{"path":"index.html","content":"hi"}]');update projects set github_connection='{"repository":"owner/repo","branch":"main","head":null}' where id='${project}';`);
 await db.exec(`set request.jwt.claim.sub='${other}'`);assert.equal((await db.query('select * from studio_features')).rows.length,0);await assert.rejects(db.exec(`insert into studio_features(owner_id,name,files) values('${owner}','Forged','[{}]')`),/row-level security/);
 await db.exec(`set request.jwt.claim.sub='${viewer}'`);await db.exec(`update projects set github_connection='{}' where id='${project}'`);const p:any=(await db.query('select github_connection from projects')).rows[0];assert.equal(p.github_connection.repository,'owner/repo');
 await db.exec(`delete from studio_features where id='${feature}';set request.jwt.claim.sub='${owner}'`);assert.equal((await db.query('select * from studio_features')).rows.length,1);await db.exec('set role anon');await assert.rejects(db.query('select * from studio_features'),/permission denied/);
 }finally{await db.close()}});
