import {validateArtifact} from './artifacts';
import type {Project,Revision} from './types';
type RecordData={project:Project;revisions:Revision[];pending?:{id:string;prompt:string;baseRevision:string|null;images?:import('./attachments').ImageAttachment[]};deployment?:{id:string;state:string;url:string}};
type Send=(path:string,method?:string,body?:unknown)=>Promise<any>;
function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('5511-studio-workspace',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects',{keyPath:'project.id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Browser storage is unavailable. Enable site storage to save your projects.'))})}
async function read(id?:string){const db=await database();try{return await new Promise<RecordData[]>((resolve,reject)=>{const req=id?db.transaction('projects').objectStore('projects').get(id):db.transaction('projects').objectStore('projects').getAll();req.onsuccess=()=>resolve(id?(req.result?[req.result]:[]):req.result);req.onerror=()=>reject(req.error)})}finally{db.close()}}
async function write(record:RecordData,expected?:string|null){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('Your project could not be saved. Browser storage may be full; download your source before leaving.'));tx.onabort=()=>reject(new Error('This project changed in another tab. Reopen it before saving a new version.'));if(expected!==undefined){const r=store.get(record.project.id);r.onsuccess=()=>{if(r.result?.project.current_revision_id!==expected){tx.abort();return}store.put(record)}}else store.put(record)})}finally{db.close()}}
async function performWorkspace(path:string,method:string,body:any,send:Send){
 const parts=path.split('/').filter(Boolean);const id=parts[2],action=parts[3];
 if(!id){if(method==='GET')return (await read()).map(r=>r.project).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));const now=new Date().toISOString();const project:Project={id:crypto.randomUUID(),name:body.name,description:body.description,created_at:now,updated_at:now,supabase_url:null,supabase_key:null,vercel_project_id:null,deployment_url:null,current_revision_id:null};await write({project,revisions:[]});return project;}
 const record=(await read(id))[0];if(!record)throw new Error('Project not found in this browser.');
 if(action==='generate'){
  const current=record.revisions.find(r=>r.id===record.project.current_revision_id);const expected=record.project.current_revision_id;
  const pending=record.pending&&record.pending.prompt===body.prompt&&record.pending.baseRevision===expected&&JSON.stringify(record.pending.images??[])===JSON.stringify(body.images??[])?record.pending:{id:crypto.randomUUID(),prompt:body.prompt,baseRevision:expected,images:body.images??[]};
  record.pending=pending;await write(record,expected);
  let result;
  try{result=await send('/api/build','POST',{requestId:pending.id,projectId:id,prompt:body.prompt,name:record.project.name,files:current?.files??[],previousSql:current?.sql??'',images:body.images??[],connected:!!record.project.supabase_url});}
  catch(error){try{const attempt=await send('/api/usage/'+pending.id);if(attempt.status==='failed'||attempt.status==='uncertain'){delete record.pending;await write(record,expected)}}catch{}throw error;}
  delete record.pending;
  const rev:Revision={id:crypto.randomUUID(),project_id:id,prompt:body.prompt,summary:result.summary,files:result.files,sql:result.sql,tokens:result.reused?0:result.tokens,requestId:result.requestId,usage:result.usage,model:result.model,reused:result.reused,created_at:new Date().toISOString()};
  record.revisions.unshift(rev);record.project={...record.project,name:result.name,current_revision_id:rev.id,updated_at:rev.created_at};
  await write(record,expected);return rev;
 }
 if(action==='edit'){
  const expected=body.expectedRevision;
  if(record.project.current_revision_id!==expected)throw new Error('This project changed. Reopen it before saving edits.');
  const current=record.revisions.find(r=>r.id===expected);if(!current)throw new Error('Version not found.');
  const artifact=validateArtifact({name:record.project.name,summary:'Text edited directly in the preview. No AI tokens used.',files:body.files,sql:current.sql});
  const rev:Revision={id:crypto.randomUUID(),project_id:id,prompt:'Direct text edit',summary:artifact.summary,files:artifact.files,sql:artifact.sql,tokens:0,created_at:new Date().toISOString()};
  record.revisions.unshift(rev);record.project={...record.project,current_revision_id:rev.id,updated_at:rev.created_at};await write(record,expected);return rev;
 }
 if(action==='deploy'){
  if(method==='POST'){const rev=record.revisions.find(r=>r.id===record.project.current_revision_id);if(!rev)throw new Error('Build your app before publishing.');record.deployment=await send('/api/publish','POST',{id,files:rev.files,url:record.project.supabase_url,key:record.project.supabase_key});}
  else if(record.deployment&&!['READY','ERROR','CANCELED'].includes(record.deployment.state))record.deployment=await send('/api/publish?id='+record.deployment.id);
  if(record.deployment?.state==='READY')record.project.deployment_url=record.deployment.url;
  await write(record,record.project.current_revision_id);return record.deployment??null;
 }
 if(method==='PATCH'){
  const expected=record.project.current_revision_id;
  if(typeof body.name==='string'){const name=body.name.trim();if(!name||name.length>80)throw new Error('Use a project name between 1 and 80 characters.');record.project.name=name;}
  if(body.supabase_url!==undefined){const c=await send('/api/connection','POST',{url:body.supabase_url,key:body.supabase_key});record.project.supabase_url=c.url;record.project.supabase_key=c.key;}
  if(body.current_revision_id){if(!record.revisions.some(r=>r.id===body.current_revision_id))throw new Error('Version not found.');record.project.current_revision_id=body.current_revision_id;}
  record.project.updated_at=new Date().toISOString();await write(record,expected);return record.project;
 }
 if(record.pending&&method==='GET'){
  const pending=record.pending;
  try{const completed=await send('/api/usage/'+pending.id);if(completed.status==='completed'&&completed.result&&record.project.current_revision_id===pending.baseRevision){const result=completed.result;const rev:Revision={id:crypto.randomUUID(),project_id:id,prompt:pending.prompt,summary:result.summary,files:result.files,sql:result.sql,tokens:result.tokens,requestId:result.requestId,usage:result.usage,model:result.model,created_at:new Date().toISOString()};record.revisions.unshift(rev);record.project={...record.project,name:result.name,current_revision_id:rev.id,updated_at:rev.created_at};delete record.pending;await write(record,pending.baseRevision)}}catch{}
 }
 return record;
}
export async function browserWorkspace(path:string,method:string,body:any,send:Send){
 if(path.endsWith('/generate')&&navigator.locks)return navigator.locks.request('5511-studio-build',{ifAvailable:true},lock=>{if(!lock)throw new Error('Another tab is already building. No extra AI request was sent.');return performWorkspace(path,method,body,send)});
 return performWorkspace(path,method,body,send);
}
export async function legacyTokenTotal(){return (await read()).reduce((sum,r)=>sum+r.revisions.filter(v=>!v.requestId).reduce((n,v)=>n+v.tokens,0),0)}

