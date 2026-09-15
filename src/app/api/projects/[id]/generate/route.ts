import {projectImageContext} from '@/lib/project-images';
import {isFullstack} from '@/lib/fullstack-project';
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
  const {id}=await ctx.params;const {prompt,requestId,images,buildId,budgetUsd,expectedRevision}=z.object({expectedRevision:z.uuid().nullable().optional(),buildId:z.uuid().optional(),budgetUsd:z.number().min(0.1).max(100).optional(),images:attachmentsSchema,requestId:z.uuid().optional(),prompt:z.string().trim().min(5).max(6000)}).parse(await readBody(request,2000000));const project=await ownedProject(db,id);await requireEditor(db,id,user.id);if(expectedRevision!==undefined&&expectedRevision!==project.current_revision_id)throw new HttpError(409,"The project changed. Reopen the plan before building.");
  const {data:run,error:lockError}=await db.rpc('begin_generation',{p_project:id});if(lockError)throw new HttpError(429,'A build is already running, or your daily build limit has been reached.');
  cleanup=async()=>{await db.rpc('fail_generation',{p_run:run})};
  const {data:previous}=project.current_revision_id?await db.from('revisions').select('files,prompt,summary,sql').eq('id',project.current_revision_id).single():{data:null};
  if(isFullstack(previous?.files??[]))throw new HttpError(400,'Use background builds for this Next.js application.');
  const library=await projectImageContext(db,id,prompt,images);
  const artifact=await generateApp(apiKey,prompt,project.name,previous?.files??[],!!project.supabase_url,{requestId,projectId:id,previousSql:previous?.sql??'',...library,previousTurn:previous?{prompt:previous.prompt??'',summary:previous.summary??''}:undefined,specification:project.specification,buildId,budgetUsd});
  const {data,error}=await db.rpc('finish_generation',{p_run:run,p_prompt:prompt,p_summary:artifact.summary,p_files:artifact.files,p_sql:artifact.sql,p_tokens:artifact.tokens,p_name:artifact.name,p_expected_revision:project.current_revision_id});if(error)throw error;
  cleanup=undefined;
  if(project.build_plan && project.build_plan.id===buildId){const plan={...project.build_plan,stages:project.build_plan.stages.map((s:any)=>s.id===requestId?{...s,status:'saved',revisionId:data.id}:s)};await db.from('projects').update({build_plan:plan}).eq('id',id).eq('current_revision_id',data.id);}
  return NextResponse.json({...data,storage:await backupRevision(db,project,data)});
 }catch(e){await cleanup?.();return failure(e)}
}
