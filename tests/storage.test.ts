import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backupRevision,revisionBundle,revisionKey,readBackup} from '../src/lib/project-storage';
import type {Project,Revision} from '../src/lib/types';
const p={id:'11111111-1111-4111-8111-111111111111',name:'Team app',description:'Backup',supabase_key:'omit-me'} as Project;
const rev={id:'22222222-2222-4222-8222-222222222222',project_id:p.id,prompt:'Build',summary:'Built',files:[{path:'index.html',content:'<h1>Team</h1>'}],sql:'',created_at:'',tokens:12} as Revision;
test('private storage validates identity, excludes credentials, rejects conflicting backups and preserves database saves',async()=>{
 let fail=false,duplicate=false,body='';
 const db={storage:{from:(bucket:string)=>{assert.equal(bucket,'studio-projects');return {upload:async(key:string,value:string,options:any)=>{assert.equal(key,revisionKey(p.id,rev.id));assert.equal(options.upsert,false);body=value;return {error:fail?{statusCode:'500'}:duplicate?{statusCode:'409'}:null}},download:async()=>({data:new Blob([duplicate?revisionBundle(p,{...rev,sql:'different'}):body]),error:null})}}}} as any;
 assert.equal((await backupRevision(db,p,rev)).state,'saved');assert.ok(!body.includes('omit-me'));assert.ok(!body.includes('supabase_key'));
 assert.deepEqual((await readBackup(db,p.id,rev.id)).files,rev.files);
 await assert.rejects(readBackup(db,p.id,'33333333-3333-4333-8333-333333333333'),/does not match/);
 assert.throws(()=>revisionKey('../other',rev.id));duplicate=true;assert.equal((await backupRevision(db,p,rev)).state,'failed');fail=true;assert.equal((await backupRevision(db,p,rev)).state,'failed');assert.equal(rev.files[0].content,'<h1>Team</h1>');
});
