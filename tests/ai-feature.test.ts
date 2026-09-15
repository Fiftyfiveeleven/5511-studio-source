import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ts from 'typescript';
import {aiFeaturePath,readAiFeature,featurePreview,installAiFeature} from '../src/lib/ai-feature';
import {fullstackTemplate} from '../src/lib/fullstack-project';
import {validateFeature} from '../src/lib/feature-library';
import {validateArtifact} from '../src/lib/artifacts';
import {generateApp} from '../src/lib/generate';
test('AI features retain executable local code and conversation across library saves and isolated reuse',()=>{
 const files=[{path:'index.html',content:'<!doctype html><html><body><button id="add">Add</button><output>0</output><script src="app.js"></script></body></html>'},{path:'app.js',content:"let n=0;document.querySelector('#add').onclick=()=>document.querySelector('output').textContent=String(++n);"},{path:aiFeaturePath,content:JSON.stringify({version:1,id:randomUUID(),height:500,history:[{prompt:'Build a counter',summary:'Added a counter'}]})}];
 const saved=validateFeature({id:randomUUID(),name:'My counter',description:'AI Feature Studio · Counter',files,sql:'',created_at:new Date().toISOString()});const recovered=JSON.parse(JSON.stringify(saved));assert.equal(readAiFeature(recovered.files)?.history[0].prompt,'Build a counter');const doc=featurePreview(files);assert.ok(doc.includes('String(++n)'));assert.ok(doc.includes("connect-src 'none'"));
 for(const source of [fullstackTemplate(),[{path:'index.html',content:'<html><body><h1>Existing</h1></body></html>'}]]){const installed=installAiFeature(source,files);validateArtifact({name:'Installed',summary:'Test',files:installed,sql:''});assert.throws(()=>installAiFeature(installed,files),/already installed/);const embed=installed.find(f=>f.path.startsWith('components/section-'))??installed[0];assert.ok(embed.content.includes('allow-scripts'));assert.ok(!embed.content.includes('allow-same-origin'));for(const f of installed.filter(f=>f.path.endsWith('.tsx'))){const parsed=ts.createSourceFile(f.path,f.content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.equal((parsed as any).parseDiagnostics.length,0)}}
});
test('AI refinement includes previous code and turn, tracks usage, and separates feature generation cache from whole apps',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ai-feature-test-')),old=process.env.STUDIO_USAGE_DIR,fetch=globalThis.fetch;process.env.STUDIO_USAGE_DIR=dir;const requests:any[]=[];
 globalThis.fetch=async(_url,init)=>{requests.push(JSON.parse(String(init?.body)));return Response.json({id:'r',object:'response',status:'completed',output:[{id:'m',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({name:'Counter',summary:'Added one',files:[{path:'index.html',content:'<h2>Updated counter</h2>'}],patches:[],sql:null}),annotations:[]}]}],usage:{input_tokens:100,output_tokens:50,total_tokens:150}})};
 try{const files=[{path:'index.html',content:'<h2>Original counter</h2>'}],options={projectId:randomUUID(),previousTurn:{prompt:'Create a counter',summary:'Counter created'}};await generateApp('feature-test-key','Add a reset button','Counter',files,false,{...options,reusableFeature:true});assert.match(requests[0].instructions,/separate reusable Feature Studio/);assert.ok(requests[0].input[0].content.includes('Original counter'));assert.ok(requests[0].input[0].content.includes('Create a counter'));await generateApp('feature-test-key','Add a reset button','Counter',files,false,options);assert.equal(requests.length,2);}finally{globalThis.fetch=fetch;if(old===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=old;await rm(dir,{recursive:true,force:true})}
});
