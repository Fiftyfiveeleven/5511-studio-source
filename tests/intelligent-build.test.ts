import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {applyPatches} from '../src/lib/code-patches';
import {verifySources,rewriteModule} from '../src/lib/source-modules';
import {renderPreview} from '../src/lib/artifacts';
import {makeBuildPlan,buildPlanSchema} from '../src/lib/project-memory';
import {usageCost} from '../src/lib/model-pricing';
import {beginUsage,recordUsage,changeLedger,usageSummary} from '../src/lib/usage-store';
test('patches preserve untouched files and reject ambiguous changes atomically',()=>{
 const files=[{path:'index.html',content:'Hello Hello'},{path:'styles.css',content:'color: red'}];
 assert.throws(()=>applyPatches(files,[{path:'styles.css',find:'red',replace:'blue'},{path:'index.html',find:'Hello',replace:'Bye'}]),/exactly once/);
 assert.equal(files[1].content,'color: red');
 assert.equal(applyPatches(files,[{path:'styles.css',find:'red',replace:'blue'}])[0].content,files[0].content);
});
test('component graphs render native modules and reject missing imports or invalid syntax',()=>{
 const files=[{path:'index.html',content:'<html><head></head><body><script type="module" src="app.js"></script></body></html>'},{path:'app.js',content:"import {x} from './components/card.js'; document.body.dataset.test=x"},{path:'components/card.js',content:'export const x="ready"'}];
 assert.deepEqual(verifySources(files).errors,[]);assert.match(rewriteModule(files[1],files),/studio\/components\/card.js/);assert.match(renderPreview(files),/importmap/);
 assert.match(verifySources(files.slice(0,2)).errors.join(),/Missing/);
 assert.ok(verifySources([...files,{path:'lib/bad.js',content:'const = ;'}]).errors.length);
});
test('focused plans preserve routing prompt, staged plans validate and pricing accounts for cached input',()=>{
 const p=makeBuildPlan('Make the header blue',false,false);assert.equal(p.stages[0].instruction,'Make the header blue');assert.equal(buildPlanSchema.parse(makeBuildPlan('Build a booking portal',true,true)).stages.length,3);
 assert.equal(usageCost('gpt-5.5',{input:1000000,cachedInput:200000,output:100000,reasoning:50000,total:1100000}),7.1);
});
test('legacy monthly and build ceilings do not block requests; costs remain tracked',async()=>{
 const dir=await mkdtemp(tmpdir()+'/studio-money-');const old=process.env.STUDIO_USAGE_DIR;process.env.STUDIO_USAGE_DIR=dir;
 const key='test-money-only';const buildId=randomUUID();const entry=()=>({id:randomUUID(),projectId:randomUUID(),name:'test',createdAt:new Date().toISOString(),model:'gpt-5.5',status:'running' as const,usage:null,reservation:100,reused:0,digest:randomUUID(),reservedUsd:0.6,buildId,buildBudgetUsd:1});
 try{const first=entry();await beginUsage(key,first);await recordUsage(key,first.id,{status:'uncertain'});const second=entry();await beginUsage(key,second);await recordUsage(key,second.id,{status:'uncertain'});await changeLedger(key,l=>{l.limits.monthlyUsd=1});await beginUsage(key,{...entry(),buildId:randomUUID(),reservedUsd:0.7});assert.equal((await usageSummary(key)).entries.length,3);assert.ok((await usageSummary(key)).monthReservedUsd!>1.8);}finally{if(old===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=old;await rm(dir,{recursive:true,force:true})}
});
test('legacy classic scripts keep inline-handler globals while component imports use modules',()=>{
 const page=renderPreview([{path:'index.html',content:'<button onclick="go()">Go</button><script src="app.js"></script>'},{path:'app.js',content:'function go(){document.body.dataset.clicked="yes"}'}]);
 assert.match(page,/<script>function go/);assert.doesNotMatch(page,/<script type="module">import/);
});
