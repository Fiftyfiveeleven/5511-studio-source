import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {artifactSchema,validateArtifact} from './artifacts';
import type {Project,Revision} from './types';
export type StorageResult={state:'saved'|'failed'|'not_configured';message:string};
export const PROJECT_BUCKET='studio-projects';
export function storageConfigured(){return !!process.env.NEXT_PUBLIC_SUPABASE_URL&&!!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
export function revisionKey(projectId:string,revisionId:string){z.uuid().parse(projectId);z.uuid().parse(revisionId);return `5511/projects/${projectId}/revisions/${revisionId}.json`}
export function revisionBundle(project:Project,revision:Revision){if(revision.project_id!==project.id)throw new Error('Revision belongs to a different project.');validateArtifact({name:project.name,summary:revision.summary,files:revision.files,sql:revision.sql});return JSON.stringify({format:'5511-project-version-v1',project:{id:project.id,name:project.name,description:project.description},revision:{id:revision.id,project_id:revision.project_id,created_at:revision.created_at,prompt:revision.prompt,summary:revision.summary,files:revision.files,sql:revision.sql,tokens:revision.tokens}})}

export async function backupRevision(db:SupabaseClient,project:Project,revision:Revision):Promise<StorageResult>{
 try{
  const body=revisionBundle(project,revision);
  if(Buffer.byteLength(body)>3000000)throw new Error('Backup too large');
  const {error}=await db.storage.from(PROJECT_BUCKET).upload(revisionKey(project.id,revision.id),body,{contentType:'application/json',upsert:false});
  if(error){
   // Immutable objects: an earlier successful upload is reusable only if its contents match.
   if(String((error as {statusCode?:string}).statusCode)!=='409')throw error;
   const existing=await readBackup(db,project.id,revision.id);
   if(JSON.stringify(existing.files)!==JSON.stringify(revision.files)||existing.sql!==revision.sql)throw new Error('Backup differs');
  }
  return {state:'saved',message:'Saved to your cloud workspace and private Supabase Storage.'};
 }catch{return {state:'failed',message:'Your version is saved in the database, but its storage copy failed. Retry from Team & storage.'}}
}
export async function hasBackup(db:SupabaseClient,projectId:string,revisionId:string){
 const key=revisionKey(projectId,revisionId),folder=key.slice(0,key.lastIndexOf('/')),name=key.slice(key.lastIndexOf('/')+1);
 const {data,error}=await db.storage.from(PROJECT_BUCKET).list(folder,{search:name,limit:10});
 if(error)throw new Error('Private project storage is unavailable. Check the Supabase storage migration.');
 return data.some(object=>object.name===name);
}
export async function readBackup(db:SupabaseClient,projectId:string,revisionId:string){
 const {data,error}=await db.storage.from(PROJECT_BUCKET).download(revisionKey(projectId,revisionId));
 if(error||!data)throw new Error('Saved storage version is unavailable.');
 if(data.size>3000000)throw new Error('Backup exceeds the size limit.');
 const bundle=z.object({format:z.literal('5511-project-version-v1'),project:z.object({id:z.uuid(),name:z.string().min(1).max(80)}),revision:z.object({id:z.uuid(),project_id:z.uuid(),files:artifactSchema.shape.files,sql:z.string().max(50000)})}).parse(JSON.parse(await data.text()));
 if(bundle.project.id!==projectId||bundle.revision.project_id!==projectId||bundle.revision.id!==revisionId)throw new Error('Backup does not match the requested project and version.');
 validateArtifact({name:bundle.project.name,summary:'Restored backup',files:bundle.revision.files,sql:bundle.revision.sql});return bundle.revision;
}
