import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {newSection,sectionKinds,renderSection,sectionFeature,readSection,sectionSchema,installSection} from '../src/lib/section-studio';
import {validateFeature} from '../src/lib/feature-library';
import {validateArtifact} from '../src/lib/artifacts';
import {fullstackTemplate} from '../src/lib/fullstack-project';

test('every section survives library export and produces valid browser and Next source',()=>{
 for(const kind of sectionKinds){const section=newSection(kind,randomUUID()),feature=validateFeature(sectionFeature(section));assert.deepEqual(readSection(JSON.parse(JSON.stringify(feature)).files),section);
 const browser=[{path:'index.html',content:'<!doctype html><html><body><main><h1>Keep me</h1></main></body></html>'},{path:'app.js',content:'console.log("keep")'}];
 for(const source of [browser,fullstackTemplate()]){const files=installSection(source,section);validateArtifact({name:'Section test',summary:'Installed',files,sql:''});assert.throws(()=>installSection(files,section),/already installed/);for(const f of source.filter(f=>!['index.html','app/page.tsx'].includes(f.path)))assert.deepEqual(files.find(x=>x.path===f.path),f);for(const f of files.filter(f=>f.path.endsWith('.tsx'))){const parsed=ts.createSourceFile(f.path,f.content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.equal((parsed as unknown as {parseDiagnostics:unknown[]}).parseDiagnostics.length,0);}}
 }
});
test('scoped styles and escaped text cannot add scripts, attributes or JSX through editable fields',()=>{
 const section=newSection('faq',randomUUID());section.title='<script>alert(1)</script> {evil}';section.items[0].body='</style><img src=x onerror=alert(1)>';const {html,css,id}=renderSection(section);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(css.includes('#'+id));for(const href of ['javascript:alert(1)','//evil.test','/\\evil.test','https://a.test/" onclick="evil'])assert.equal(sectionSchema.safeParse({...section,href}).success,false);
});
test('insertion preserves client directives, nested imports, and rejects ambiguous targets without changes',()=>{
 const section=newSection('hero',randomUUID());const source=[...fullstackTemplate(),{path:'app/about/page.tsx',content:"'use client';\nexport default function Page(){return <main><button onClick={()=>alert('ok')}>Keep</button></main>}"}];const before=JSON.stringify(source),files=installSection(source,section,'app/about/page.tsx'),page=files.find(f=>f.path==='app/about/page.tsx')!.content;assert.ok(page.startsWith("'use client';"));assert.match(page,/from '\.\.\/\.\.\/components\//);assert.ok(page.includes("onClick={()=>alert('ok')}"));assert.equal(JSON.stringify(source),before);
 const ambiguous=source.map(f=>f.path==='app/page.tsx'?{...f,content:'export default function Page(){return <div><main></main><main></main></div>}'}:f);assert.throws(()=>installSection(ambiguous,section),/single <main>/);assert.throws(()=>installSection(source,section,'app/missing/page.tsx'),/existing page/);
});
