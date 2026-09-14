import {z} from 'zod';
import {start} from 'workflow/api';
import {buildProjectWorkflow} from '@/workflows/build-project';
import {buildPlanSchema} from '@/lib/project-memory';
import {attachmentsSchema} from '@/lib/attachments';
import {authorize,ownedProject,readBody,failure,HttpError} from '@/lib/server';
import {requireEditor} from '@/lib/project-access';
import {requireSameOrigin,credential} from '@/lib/credentials';
import {jobsDb,sealJobCredential,finishJob} from '@/lib/job-store';
import {runtimeReady} from '@/lib/runtime-sandbox';
import {isFullstack} from '@/lib/fullstack-project';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,ctx:Context){try{const {db}=await authorize(request);const {id}=await ctx.params;await ownedProject(db,id);const {data,error}=await db.from('studio_build_jobs').select('id,status,stage,plan,runtime,expected_revision,report,error,cancel_requested,created_at,updated_at').eq('project_id',id).order('created_at',{ascending:false}).limit(5);if(error)throw new HttpError(503,'Background job storage needs the Phase 1 migration.');return Response.json({jobs:data},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(request:Request,ctx:Context){try{requireSameOrigin(request);const {db,user}=await authorize(request);const {id}=await ctx.params;const p=await ownedProject(db,id);await requireEditor(db,id,user.id);const input=z.object({plan:buildPlanSchema,images:attachmentsSchema,runtime:z.enum(['browser','nextjs'])}).parse(await readBody(request,2000000));if(!runtimeReady())throw new HttpError(503,'Enable Vercel Sandbox in Studio server settings before background builds.');const key=credential(request,'openai')||process.env.OPENAI_API_KEY;if(!key)throw new HttpError(400,'Connect OpenAI first.');if(input.plan.baseRevision!==p.current_revision_id)throw new HttpError(409,'Project changed. Prepare a fresh plan.');if(input.plan.stages.some(s=>s.status!=='pending'))throw new HttpError(400,'Start a fresh background plan; prior job attempts remain recorded.');
 const admin=jobsDb();const {data:existing}=await admin.from('studio_build_jobs').select('id,project_id,status').eq('id',input.plan.id).maybeSingle();if(existing){if(existing.project_id!==id)throw new HttpError(409,'Plan identifier already used.');return Response.json(existing);}
 const {data:r}=p.current_revision_id?await db.from('revisions').select('files').eq('id',p.current_revision_id).single():{data:null};const runtime=r?(isFullstack(r.files)?'nextjs':'browser'):input.runtime;
 const {error}=await admin.rpc('enqueue_studio_job',{p_job:{id:input.plan.id,project_id:id,user_id:user.id,plan:input.plan,images:input.images,runtime,expected_revision:p.current_revision_id},p_ciphertext:sealJobCredential(key)});if(error)throw new HttpError(409,'A job is already active, your daily job limit was reached, or job storage is not ready.');
 try{const run=await start(buildProjectWorkflow,[input.plan.id]);await admin.from('studio_build_jobs').update({workflow_id:run.runId}).eq('id',input.plan.id);return Response.json({id:input.plan.id,status:'queued'},{status:202});}catch{await finishJob(input.plan.id,'failed','Could not dispatch the background workflow. No automatic retry.');throw new HttpError(503,'Workflow dispatch failed. Check the deployment workflow configuration.');}
 }catch(e){return failure(e)}}
export async function DELETE(request:Request,ctx:Context){try{requireSameOrigin(request);const {db,user}=await authorize(request);const {id}=await ctx.params;await requireEditor(db,id,user.id);const {error}=await jobsDb().from('studio_build_jobs').update({cancel_requested:true}).eq('project_id',id).in('status',['queued','running']);if(error)throw error;return Response.json({cancelRequested:true});}catch(e){return failure(e)}}
