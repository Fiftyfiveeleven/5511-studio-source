import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {editImage} from '../src/lib/image-edit';
import {usageSummary} from '../src/lib/usage-store';
test('image editor uploads the image, records cost and reuses the same request without another paid call',async()=>{
 const dir=await mkdtemp(tmpdir()+'/studio-edit-test-');const old=process.env.STUDIO_USAGE_DIR,fetch=globalThis.fetch;process.env.STUDIO_USAGE_DIR=dir;let calls=0;
 globalThis.fetch=async(_url,init)=>{if(String(_url)==='data:,')return new Response('');calls++;const body=init?.body as FormData;assert.equal(body.get('model'),'gpt-image-1.5');assert.equal(body.get('input_fidelity'),'high');assert.ok(body.get('image'));return Response.json({created:0,data:[{b64_json:'UklGRg=='}],usage:{input_tokens:100,input_tokens_details:{text_tokens:20,image_tokens:80},output_tokens:50,total_tokens:150}});};
 const input={requestId:randomUUID(),prompt:'Remove only the background',image:{name:'logo.png',dataUrl:'data:image/png;base64,iVBORw0KGgo='}};
 try{const result:any=await editImage('image-edit-test-key',input);assert.ok(result.dataUrl.startsWith('data:image/webp;'));assert.equal(calls,1);await editImage('image-edit-test-key',input);assert.equal(calls,1);const summary=await usageSummary('image-edit-test-key');assert.equal(summary.entries[0].status,'completed');assert.equal(summary.entries[0].costUsd,(20*5+80*8+50*32)/1e6);}finally{globalThis.fetch=fetch;if(old===undefined)delete process.env.STUDIO_USAGE_DIR;else process.env.STUDIO_USAGE_DIR=old;await rm(dir,{recursive:true,force:true})}
});
