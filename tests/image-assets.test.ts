import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attachAssets,assetCatalog,assetPath} from '../src/lib/image-assets';
import {fullstackTemplate,validateFullstack} from '../src/lib/fullstack-project';
import {verifySources} from '../src/lib/source-modules';
import {validateArtifact} from '../src/lib/artifacts';
import {exportGithubFiles} from '../src/lib/github';
import {prepareImage} from '../src/lib/attachments';
const image={name:'logo.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'};
test('uploaded bytes survive managed modules, validation and GitHub export without reconstruction',()=>{
 for(const base of [[{path:'index.html',content:'<h1>Test</h1>'}],fullstackTemplate()]){
  const files=attachAssets(base,[image]);const chunks=files.filter(f=>/image-.*-\d\.[jt]s$/.test(f.path));
  assert.equal(chunks.map(f=>JSON.parse(f.content.slice('export default '.length,-1))).join(''),image.dataUrl);
  assert.equal(attachAssets(files,[image]).length,files.length);
  assert.equal(assetCatalog(files)[0].name,'logo.png');
  validateArtifact({name:'Test',summary:'Test',files,sql:''});
  const exported=exportGithubFiles({projectId:'test',name:'Test',files,sql:'',url:null,key:null});
  assert.ok(chunks.every(f=>exported.some(e=>e.path===(base.some(b=>b.path==='package.json')?'':'source/')+f.path&&e.content===f.content)));
  if(base.some(f=>f.path==='package.json'))validateFullstack(files);else assert.deepEqual(verifySources(files).errors,[]);
 }
 assert.equal(attachAssets([{path:'index.html',content:'test'}],[{...image,useAs:'reference'}]).length,1);
});
test('large image payloads split below per-file limits without losing bytes',()=>{
 const large={...image,dataUrl:'data:image/png;base64,'+'A'.repeat(390000)};const files=attachAssets(fullstackTemplate(),[large]);
 assert.ok(files.filter(f=>assetPath(f.path)).every(f=>f.content.length<160000));
 assert.equal(files.filter(f=>/image-.*-\d\.ts$/.test(f.path)).map(f=>JSON.parse(f.content.slice(15,-1))).join(''),large.dataUrl);
});
test('small transparent upload is preserved without a canvas or JPEG conversion',async()=>{
 const oldReader=globalThis.FileReader,oldBitmap=globalThis.createImageBitmap;
 (globalThis as any).FileReader=class{result=image.dataUrl;onload:any;readAsDataURL(){this.onload()}};
 globalThis.createImageBitmap=async()=>({close(){}} as ImageBitmap);
 try{const prepared=await prepareImage(new File(['source'],'logo.png',{type:'image/png'}));assert.equal(prepared.dataUrl,image.dataUrl);assert.equal(prepared.optimized,false);assert.equal(prepared.useAs,'asset');}finally{globalThis.FileReader=oldReader;globalThis.createImageBitmap=oldBitmap;}
});
test('generation receives vision and an exact asset import while later context excludes image bytes',async()=>{
 const {generateApp,estimateGeneration}=await import('../src/lib/generate');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');
 const dir=await mkdtemp(tmpdir()+'/studio-logo-'),old=process.env.STUDIO_USAGE_DIR,original=globalThis.fetch;process.env.STUDIO_USAGE_DIR=dir;let corrupt=false;
 const symbol=assetCatalog(attachAssets([],[image]))[0].symbol;
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));assert.equal(body.input[1].content[1].image_url,image.dataUrl);assert.ok(!body.input[0].content.includes(image.dataUrl));assert.ok(body.instructions.includes(symbol));return Response.json({id:'r',object:'response',status:'completed',output:[{id:'m',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({name:'App',summary:'Logo connected',files:corrupt?[{path:'lib/studio-assets.js',content:'bad'}]:[{path:'index.html',content:'<img id="logo" alt="Logo"><script type="module" src="./app.js"></script>'},{path:'app.js',content:`import {${symbol}} from './lib/studio-assets.js'; document.getElementById('logo').src=${symbol};`}],sql:''}),annotations:[]}]}],usage:{input_tokens:100,output_tokens:100,total_tokens:200}})};
 try{const result=await generateApp('logo-test','Use this logo','App',[],false,{images:[image]});assert.ok(result.files.some(f=>f.content.includes(image.dataUrl)));const estimate=await estimateGeneration('logo-test','Change the title','App',result.files,false);assert.ok(!estimate.context.includes(image.dataUrl));assert.ok(estimate.requestInstructions.includes(symbol));corrupt=true;await assert.rejects(generateApp('logo-test','Replace logo now','App',result.files,false,{images:[image]}),/protected uploaded image/);}finally{globalThis.fetch=original;if(old===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=old;await rm(dir,{recursive:true,force:true})}
});
