import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
test('Postgres enforces tenant isolation, immutable versions, protected quotas, and atomic version restore',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${alice}'),('${bob}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${alice}';`);
 const {rows:[p]}=await db.query<{id:string}>(`insert into public.projects(owner_id,name) values($1,'Alice project') returning id`,[alice]);
 const {rows:[run]}=await db.query<{id:string}>(`select public.begin_generation($1) id`,[p.id]);
 await assert.rejects(db.query(`select public.begin_generation($1)`,[p.id]),/Build running/);
 await assert.rejects(db.query(`update public.generation_runs set created_at='2000-01-01' where id=$1`,[run.id]),/permission denied/);
 const {rows:[result]}=await db.query<{revision:{id:string}}>(`select public.finish_generation($1,'Build it','Built',$2::jsonb,'',100,'Alice project',null) revision`,[run.id,JSON.stringify([{path:'index.html',content:'<h1>Hello</h1>'}])]);
 const rev=result.revision.id;
 assert.equal((await db.query<{current_revision_id:string}>(`select current_revision_id from public.projects where id=$1`,[p.id])).rows[0].current_revision_id,rev);
 await assert.rejects(db.query(`update public.revisions set summary='changed' where id=$1`,[rev]),/permission denied/);
 await db.exec(`set request.jwt.claim.sub='${bob}';`);
 assert.equal((await db.query(`select * from public.projects where id=$1`,[p.id])).rows.length,0);
 assert.equal((await db.query(`select * from public.revisions where id=$1`,[rev])).rows.length,0);
 await assert.rejects(db.query(`select public.begin_generation($1)`,[p.id]),/Project not found/);
 await assert.rejects(db.query(`insert into public.projects(owner_id,name) values($1,'Stolen')`,[alice]),/row-level security/);
 const {rows:[bp]}=await db.query<{id:string}>(`insert into public.projects(owner_id,name) values($1,'Bob project') returning id`,[bob]);
 await assert.rejects(db.query(`update public.projects set current_revision_id=$1 where id=$2`,[rev,bp.id]),/foreign key/);
 await assert.rejects(db.query(`select public.finish_generation($1,'bad','bad','[]','',0,'bad',null)`,[run.id]),/Invalid generation/);
 await db.exec(`set request.jwt.claim.sub='${alice}';`);
 const {rows:[run2]}=await db.query<{id:string}>(`select public.begin_generation($1) id`,[p.id]);
 await assert.rejects(db.query(`select public.finish_generation($1,'bad','bad','[]','',0,'bad',null)`,[run2.id]),/Project changed/);
 assert.equal((await db.query(`select * from public.revisions where project_id=$1`,[p.id])).rows.length,1);
 await db.query(`select public.fail_generation($1)`,[run2.id]);
 for(let i=0;i<28;i++){const {rows:[r]}=await db.query<{id:string}>(`select public.begin_generation($1) id`,[p.id]);await db.query(`select public.fail_generation($1)`,[r.id]);}
 await assert.rejects(db.query(`select public.begin_generation($1)`,[p.id]),/Daily build limit/);
 await db.exec(`reset role; set role anon;`);
 await assert.rejects(db.query(`select public.begin_generation($1)`,[p.id]),/permission denied/);
 }finally{await db.close()}
});
