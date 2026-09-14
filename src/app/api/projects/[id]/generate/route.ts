import {backupRevision} from '@/lib/project-storage';
import {requireEditor} from '@/lib/project-access';
import {attachmentsSchema} from '@/lib/attachments';
import {generateApp} from '@/lib/generate';
import {credential,requireSameOrigin} from '@/lib/credentials';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize,failure,readBody,ownedProject,HttpError } from '@/lib/server';
import { validateArtifact } from '@/lib/artifacts';
export const maxDuration=300;
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){
 let cleanup:(()=>Promise<void>)|undefined;
 try{
  requireSameOrigin(request);const {db,user}=await authorize(request);const apiKey=credential(request,'openai')||process.env.OPENAI_API_KEY;if(!apiKey)throw new HttpError(400,'Add your OpenAI key in Settings to start building.');
  const {id}=await ctx.params;const {prompt,requestId,images}=z.object({images:attachmentsSchema,requestId:z.uuid().optional(),prompt:z.string().trim().min(5).max(6000)}).parse(await readBody(request,2000000));const project=await ownedProject(db,id);await requireEditor(db,id,user.id);
  const {data:run,error:lockError}=await db.rpc('begin_generation',{p_project:id});if(lockError)throw new HttpError(429,'A build is already running, or your daily build limit has been reached.');
  cleanup=async()=>{await db.rpc('fail_generation',{p_run:run})};
  const {data:previous}=project.current_revision_id?await db.from('revisions').select('files,summary,sql').eq('id',project.current_revision_id).single():{data:null};
  const artifact=await generateApp(apiKey,prompt,project.name,previous?.files??[],!!project.supabase_url,{requestId,projectId:id,previousSql:previous?.sql??'',images});
  const {data,error}=await db.rpc('finish_generation',{p_run:run,p_prompt:prompt,p_summary:artifact.summary,p_files:artifact.files,p_sql:artifact.sql,p_tokens:artifact.tokens,p_name:artifact.name,p_expected_revision:project.current_revision_id});if(error)throw error;
  cleanup=undefined;return NextResponse.json({...data,storage:await backupRevision(db,project,data)});
 }catch(e){await cleanup?.();return failure(e)}
}
