import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {pushGithub,exportGithubFiles,repositoryPath} from '../src/lib/github';
import {POST as connect,GET as status,DELETE as disconnect} from '../src/app/api/github/route';
import {POST as start} from '../src/app/api/github/oauth/start/route';
import {GET as callback} from '../src/app/api/github/oauth/callback/route';
const origin='http://127.0.0.1:3001';
const req=(path:string,body:unknown)=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('GitHub credentials stay server-side and OAuth checks state plus PKCE',async()=>{
 const fetch=globalThis.fetch,env={id:process.env.GITHUB_CLIENT_ID,secret:process.env.GITHUB_CLIENT_SECRET,uri:process.env.GITHUB_REDIRECT_URI};let calls=0;
 try{globalThis.fetch=async()=>{calls++;return Response.json({login:'test-owner'})};
 const saved=await connect(req('/api/github',{token:'fake-github-token'}));assert.equal(saved.status,200);const cookie=saved.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=strict/);assert.ok(!(await saved.text()).includes('fake-github-token'));
 const result=await status(new Request(origin+'/api/github',{headers:{Cookie:cookie.split(';')[0]}}));assert.equal((await result.json()).login,'test-owner');
 const removed=await disconnect(req('/api/github',{}));assert.match(removed.headers.get('set-cookie')!,/Max-Age=0/);
 process.env.GITHUB_CLIENT_ID='test-client';process.env.GITHUB_CLIENT_SECRET='test-secret';process.env.GITHUB_REDIRECT_URI=origin+'/api/github/oauth/callback';
 const begun=await start(req('/api/github/oauth/start',{}));const url=new URL((await begun.json()).url);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('scope'),'repo');assert.ok(url.searchParams.get('state')!.length>30);
 const before=calls;const bad=await callback(new Request(origin+'/api/github/oauth/callback?code=x&state=wrong'));assert.match(bad.headers.get('location')!,/github_error/);assert.equal(calls,before);
 const cookies=begun.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 globalThis.fetch=async(input,init)=>{if(String(input).includes('access_token')){const body=JSON.parse(String(init?.body));assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'),url.searchParams.get('code_challenge'));return Response.json({access_token:'fake-oauth-token',expires_in:3600})}return Response.json({login:'owner'})};
 const good=await callback(new Request(origin+'/api/github/oauth/callback?code=test&state='+url.searchParams.get('state'),{headers:{Cookie:cookies}}));assert.match(good.headers.get('location')!,/github_connected/);assert.match(good.headers.get('set-cookie')!,/studio_github=fake-oauth-token/);assert.match(good.headers.get('set-cookie')!,/Max-Age=3600/);
 }finally{globalThis.fetch=fetch;for(const [key,val] of [['GITHUB_CLIENT_ID',env.id],['GITHUB_CLIENT_SECRET',env.secret],['GITHUB_REDIRECT_URI',env.uri]]){if(val===undefined)delete process.env[key!];else process.env[key!]=val}}
});
test('GitHub publishing isolates projects, preserves unrelated files and never force-pushes',async()=>{
 const fetch=globalThis.fetch;const input={projectId:randomUUID(),name:'Test app',repository:'owner/test-app',branch:'main',files:[{path:'index.html',content:'<html><head></head><body><h1>App</h1></body></html>'}],sql:'',url:null,key:null};
 let bound=input.projectId;let unrelated=false;let duplicate=false;const mutations:{url:string;body:any}[]=[];
 globalThis.fetch=async(url,init)=>{const u=String(url);const body=init?.body?JSON.parse(String(init.body)):null;if(init?.method!=='GET'){mutations.push({url:u,body});return Response.json({sha:u.includes('trees')?'new-tree':'new-commit'})}
 if(u.endsWith('/repos/owner/test-app'))return Response.json({permissions:{push:true}});
 if(u.includes('/git/ref/'))return Response.json({object:{sha:'old-commit'}});
 if(u.includes('/git/commits/'))return Response.json({tree:{sha:'old-tree'}});
 if(u.includes('/git/trees/'))return Response.json({tree:duplicate?exportGithubFiles(input).map(f=>({path:f.path,sha:createHash('sha1').update(`blob ${Buffer.byteLength(f.content)}\0`).update(f.content).digest('hex'),type:'blob'})):unrelated?[{path:'index.html',sha:'x',type:'blob'}]:[{path:'.5511/project.json',sha:'marker',type:'blob'},{path:'notes.txt',sha:'keep',type:'blob'}]});
 if(u.includes('/git/blobs/'))return Response.json({content:Buffer.from(JSON.stringify({projectId:bound})).toString('base64')});throw new Error('Unexpected endpoint '+u);
 };
 try{const result=await pushGithub('fake-token',input);assert.equal(result.sha,'new-commit');assert.equal(mutations.length,3);assert.equal(mutations[0].body.base_tree,'old-tree');assert.ok(!mutations[0].body.tree.some((f:any)=>f.path==='notes.txt'));assert.deepEqual(mutations[2].body,{sha:'new-commit',force:false});assert.ok(mutations[0].body.tree.find((f:any)=>f.path==='index.html').content.includes('STUDIO_CONFIG'));
 mutations.length=0;bound=randomUUID();await assert.rejects(pushGithub('fake-token',input),/another Studio project/);assert.equal(mutations.length,0);
 unrelated=true;await assert.rejects(pushGithub('fake-token',input),/unrelated app/);assert.equal(mutations.length,0);
 unrelated=false;bound=input.projectId;duplicate=true;const same=await pushGithub('fake-token',input);assert.equal(same.unchanged,true);assert.equal(mutations.length,0);
 assert.throws(()=>repositoryPath('owner/repo/../../user'));assert.throws(()=>repositoryPath('owner/..'));
 }finally{globalThis.fetch=fetch}
});
