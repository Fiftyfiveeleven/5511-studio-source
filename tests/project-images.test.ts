import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {PGlite} from '@electric-sql/pglite';
import {selectLibraryImages,type ProjectImage} from '../src/lib/project-images';
import {generateProjectImage,IMAGE_MODEL} from '../src/lib/image-generation';
import {usageSummary} from '../src/lib/usage-store';
import {attachAssets,assetCatalog} from '../src/lib/image-assets';
const image=(label:string,status='ready')=>({id:randomUUID(),label,status,data_url:'data:image/webp;base64,'+Buffer.from(label).toString('base64')} as ProjectImage);
test('later requests select labeled library assets, preserve current uploads, and retain renamed exact sources',()=>{
 const rows=[image('Team portrait'),image('Homepage hero'),image('Old failed image','failed')];
 const chosen=selectLibraryImages(rows,'Use the saved image "Homepage hero" above the heading');assert.equal(chosen.length,1);assert.equal(chosen[0].name,'Homepage hero');assert.equal(chosen[0].dataUrl,rows[1].data_url);
 assert.equal(selectLibraryImages(rows,'Change the footer text').length,0);
 assert.equal(selectLibraryImages(rows,'Homepage hero',[{name:'uploaded',dataUrl:'x'}]).length,2);
 const first=attachAssets([],chosen),renamed=attachAssets(first,[{...chosen[0],name:'Main banner'}]);assert.equal(assetCatalog(renamed)[0].name,'Main banner');assert.equal(renamed.length,first.length);
});
test('image generation uses requested model, preserves original, prepares builder copy and records actual cost',async()=>{
 const dir=await mkdtemp(tmpdir()+'/studio-images-'),old=process.env.STUDIO_USAGE_DIR,fetch=globalThis.fetch;process.env.STUDIO_USAGE_DIR=dir;let calls=0;
 const original=(await sharp({create:{width:1536,height:1024,channels:4,background:'#00a3cc'}}).webp().toBuffer()).toString('base64');
 globalThis.fetch=async(url,init)=>{if(String(url)==='data:,')return new Response('');calls++;const body=JSON.parse(init?.body as string);assert.equal(body.model,'gpt-image-2.5-sunburst');assert.equal(body.n,1);return Response.json({created:0,data:[{b64_json:original}],usage:{input_tokens:100,input_tokens_details:{text_tokens:100,image_tokens:0},output_tokens:50,total_tokens:150}})};
 try{const out=await generateProjectImage('library-test-key',randomUUID(),{requestId:randomUUID(),label:'Hero',prompt:'A blue abstract background',size:'1536x1024',quality:'medium'});assert.equal(calls,1);assert.equal(out.original_data_url,'data:image/webp;base64,'+original);assert.ok(out.data_url.length<400000);assert.equal(out.cost_usd,(100*5+50*30)/1e6);const summary=await usageSummary('library-test-key');assert.equal(summary.entries[0].model,IMAGE_MODEL);assert.equal(summary.entries[0].status,'completed');}finally{globalThis.fetch=fetch;if(old===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=old;await rm(dir,{recursive:true,force:true})}
});
test('image library RLS allows project collaborators to read but only editors to change images',async()=>{
 const db=new PGlite();const owner=randomUUID(),viewer=randomUUID(),stranger=randomUUID(),project=randomUUID(),id=randomUUID();
 try{await db.exec(`create role authenticated;create role service_role;create schema auth;create schema studio_private;create table auth.users(id uuid primary key);create table public.projects(id uuid primary key);insert into auth.users values('${owner}'),('${viewer}'),('${stranger}');insert into projects values('${project}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function studio_private.project_role(uuid) returns text language sql stable as $$select case when $1='${project}' then case auth.uid() when '${owner}' then 'owner' when '${viewer}' then 'viewer' end end$$;grant usage on schema auth,studio_private to authenticated;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20260915104230_project_image_library.sql',import.meta.url),'utf8'));
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}';insert into studio_project_images(id,project_id,created_by,label,prompt,model,status) values('${id}','${project}','${owner}','Hero','A background','test','generating');update studio_project_images set status='ready',data_url='data:image/webp;base64,AAAA' where id='${id}';`);
 await db.exec(`set request.jwt.claim.sub='${viewer}'`);assert.equal((await db.query('select * from studio_project_images')).rows.length,1);assert.equal((await db.query("update studio_project_images set label='hijack' returning id")).rows.length,0);
 await assert.rejects(db.exec(`insert into studio_project_images(id,project_id,created_by,label,prompt,model,status) values('${randomUUID()}','${project}','${viewer}','Other','A background','test','generating')`),/row-level security/);
 await db.exec(`set request.jwt.claim.sub='${stranger}'`);assert.equal((await db.query('select * from studio_project_images')).rows.length,0);
 }finally{await db.close()}
});
