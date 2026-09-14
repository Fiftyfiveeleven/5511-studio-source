import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeBuild,checkRoutingScope} from '../src/lib/build-routing';
const files=[{path:'index.html',content:'<h1>Hello</h1>'},{path:'styles.css',content:'h1{color:red}'},{path:'app.js',content:'console.log("ready")'}];
test('only simple static visual edits use focused context; ambiguity and dependencies retain full context',()=>{
 const r=routeBuild('Change the heading color to blue',files,false);assert.equal(r.focused,true);assert.equal(r.info.tier,'fast');assert.deepEqual(r.files.map(f=>f.path),['index.html','styles.css']);assert.equal(r.info.omittedCharacters,files[2].content.length);
 for(const prompt of ['Build a website','Change the color and add login','Fix the button click','Redesign the layout','Make it better'])assert.equal(routeBuild(prompt,files,false).focused,false);
 assert.equal(routeBuild('Change heading color',files,true).focused,false);assert.equal(routeBuild('Change heading color',[],false).focused,false);
 assert.equal(routeBuild('Change heading color',[...files.slice(0,2),{path:'app.js',content:'el.innerHTML="hi"'}],false).focused,false);
 assert.throws(()=>checkRoutingScope({files:[{path:'app.js'}],sql:null},r.editable,true));assert.throws(()=>checkRoutingScope({files:[],sql:'drop table x'},r.editable,true));checkRoutingScope({files:[{path:'styles.css'}],sql:null},r.editable,true);
});
import {generateApp} from '../src/lib/generate';
import {usageSummary} from '../src/lib/usage-store';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('generation sends focused context, records model choice, preserves omitted files and invalidates cache when omitted source changes',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'studio-routing-'));const old=process.env.STUDIO_USAGE_DIR,fetch=globalThis.fetch;process.env.STUDIO_USAGE_DIR=dir;let calls=0;let sent:any;
 globalThis.fetch=async(_input,init)=>{calls++;sent=JSON.parse(String(init?.body));return Response.json({id:'test',object:'response',status:'completed',output:[{type:'message',role:'assistant',id:'m',status:'completed',content:[{type:'output_text',text:JSON.stringify({name:'Renamed',summary:'Updated color',files:[{path:'styles.css',content:'h1{color:blue}'}],sql:null}),annotations:[]}]}],usage:{input_tokens:10,output_tokens:10,total_tokens:20}});};
 try{
 const key='routing-test-not-real';const result=await generateApp(key,'Change the heading color to blue','Existing app',files,false,{previousSql:'private schema'});
 assert.equal(sent.model,process.env.OPENAI_FAST_MODEL||'gpt-5.4-mini');assert.ok(!sent.input[0].content.includes('private schema'));assert.ok(!sent.input[0].content.includes('console.log'));assert.equal(result.name,'Existing app');assert.equal(result.sql,'private schema');assert.equal(result.files.find(f=>f.path==='app.js')?.content,files[2].content);
 assert.equal((await usageSummary(key)).entries[0].routing?.tier,'fast');
 await generateApp(key,'Change the heading color to blue','Existing app',files,false,{previousSql:'private schema'});assert.equal(calls,1);
 await generateApp(key,'Change the heading color to blue','Existing app',[...files.slice(0,2),{path:'app.js',content:'console.log("changed")'}],false,{previousSql:'private schema'});assert.equal(calls,2);
 }finally{globalThis.fetch=fetch;if(old===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=old;await rm(dir,{recursive:true,force:true})}
});
