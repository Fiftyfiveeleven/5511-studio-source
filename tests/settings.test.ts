import {test} from 'node:test';
import assert from 'node:assert/strict';
import {POST,GET,DELETE} from '../src/app/api/settings/route';
import {POST as build} from '../src/app/api/build/route';
import {POST as publish} from '../src/app/api/publish/route';
import {requireSameOrigin} from '../src/lib/credentials';
const origin='http://localhost:3000';
test('loopback origin uses the browser Host without allowing other websites or ports',()=>{
 const req=(origin:string,host='127.0.0.1:3001')=>new Request('http://localhost:3001/api/settings',{headers:{Origin:origin,Host:host}});
 assert.doesNotThrow(()=>requireSameOrigin(req('http://127.0.0.1:3001')));
 assert.throws(()=>requireSameOrigin(req('http://localhost:3001')));
 assert.throws(()=>requireSameOrigin(req('http://127.0.0.1:3002')));
 assert.throws(()=>requireSameOrigin(req('http://evil.example:3001','evil.example:3001')));
 assert.throws(()=>requireSameOrigin(req('null')));
 assert.throws(()=>requireSameOrigin(new Request('http://localhost:3001/api/settings')));
 assert.throws(()=>requireSameOrigin(new Request('https://studio.example/api/settings',{headers:{Origin:'https://evil.example',Host:'evil.example'}})));
});
function request(path:string,body:unknown,cookie=''){return new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)})}
test('settings validates keys, stores HTTP-only cookies, returns no secrets and supports removal',async()=>{
 const original=globalThis.fetch;const secret='test-openai-credential-not-real';
 try{globalThis.fetch=async(input,init)=>{assert.equal(String(input),'https://api.openai.com/v1/models');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer '+secret);return new Response('{"data":[]}',{status:200})};
 const saved=await POST(request('/api/settings',{provider:'openai',key:secret}));assert.equal(saved.status,200);assert.equal((await saved.json()).saved,true);
 const cookie=saved.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=strict/i);assert.match(cookie,/Path=\/api/i);
 const status=GET(new Request(origin+'/api/settings',{headers:{Cookie:cookie.split(';')[0]}}));const data=await status.text();assert.match(data,/"generation":true/);assert.ok(!data.includes(secret));
 const deleted=await DELETE(request('/api/settings',{provider:'openai'}));assert.match(deleted.headers.get('set-cookie')!,/Max-Age=0/i);
 globalThis.fetch=async()=>new Response('{"error":"private details"}',{status:401});const rejected=await POST(request('/api/settings',{provider:'openai',key:secret}));assert.equal(rejected.status,400);assert.equal(rejected.headers.get('set-cookie'),null);assert.ok(!(await rejected.text()).includes(secret));
 }finally{globalThis.fetch=original}
});
test('guest endpoints reject cross-origin requests and never borrow the server OpenAI key',async()=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='server-key-must-never-be-used';
 try{const noKey=await build(request('/api/build',{prompt:'Build a website',name:'App',files:[],connected:false}));assert.equal(noKey.status,400);
 const foreign=await POST(new Request(origin+'/api/settings',{method:'POST',headers:{Origin:'https://foreign.example'},body:JSON.stringify({provider:'openai',key:'not-a-real-key'})}));assert.equal(foreign.status,403);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old}
});
test('publishing with an owned Vercel key does not require Supabase',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async(input,init)=>{assert.match(String(input),/^https:\/\/api.vercel.com\/v13\/deployments/);const body=JSON.parse(init?.body as string);assert.equal(body.files[0].file,'index.html');assert.match(body.files[0].data,/Hello/);return Response.json({id:'dpl_test',url:'app.vercel.app',readyState:'QUEUED'})};
 const res=await publish(request('/api/publish',{id:'11111111-1111-4111-8111-111111111111',files:[{path:'index.html',content:'<h1>Hello</h1>'}],url:null,key:null},'studio_vercel=test-owned-token'));assert.equal(res.status,200);assert.equal((await res.json()).state,'QUEUED');
 }finally{globalThis.fetch=original}
});
