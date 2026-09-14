import {loadJob,assertJobAccess,jobsDb,openJobCredential,finishJob} from '@/lib/job-store';
import {recordUsage} from '@/lib/usage-store';
import {generateApp} from '@/lib/generate';
import {fullstackTemplate,isFullstack} from '@/lib/fullstack-project';
import {checkRuntime} from '@/lib/runtime-sandbox';
import {verifySources} from '@/lib/source-modules';
import {randomUUID} from 'node:crypto';
async function countStages(id:string){
 'use step';
const j=await loadJob(id);return j.plan.stages.length;}
async function buildStage(id:string,index:number){
 
 'use step';

 const j=await loadJob(id);if(j.stage>index)return true;if(j.cancel_requested||j.status==='cancelled'){await finishJob(id,'cancelled');return false;}if(['completed','failed'].includes(j.status))return false;
 try{
 const p=await assertJobAccess(j);if(p.current_revision_id!==j.expected_revision)throw new Error('Project changed. Review the saved version before a new build.');
 const db=jobsDb();const {data:secret}=await db.from('studio_job_secrets').select('*').eq('job_id',id).single();if(!secret||Date.parse(secret.expires_at)<Date.now())throw new Error('Build authorization expired. Start a new plan.');
 const apiKey=openJobCredential(secret.ciphertext);const {data:previous}=j.expected_revision?await db.from('revisions').select('*').eq('id',j.expected_revision).single():{data:null};
 const files=previous?.files??(j.runtime==='nextjs'?fullstackTemplate():[]);const stage=j.plan.stages[index];
 await db.from('studio_build_jobs').update({status:'running',updated_at:new Date().toISOString()}).eq('id',id);
 const artifact=await generateApp(apiKey,stage.instruction,p.name,files,!!p.supabase_url,{requestId:stage.id,projectId:p.id,images:j.images,specification:p.specification,previousSql:previous?.sql??'',buildId:id,budgetUsd:j.plan.budgetUsd});
 if(isFullstack(artifact.files)){const report=await checkRuntime(artifact.files,false);if(!report.compiled){await recordUsage(apiKey,(artifact as {requestId?:string}).requestId??stage.id,{status:'failed',error:('Runtime compilation failed: '+report.errors.join('; ')).slice(0,2000)});throw new Error('Runtime compilation failed: '+report.errors.join('; '));}}
 const latest=await loadJob(id);await assertJobAccess(latest);if(latest.cancel_requested){await finishJob(id,'cancelled');return false;}
 const {error}=await db.rpc('commit_studio_job',{p_job:id,p_stage:index,p_expected:j.expected_revision,p_revision:randomUUID(),p_prompt:stage.instruction,p_summary:artifact.summary,p_files:artifact.files,p_sql:artifact.sql,p_tokens:artifact.reused?0:artifact.tokens,p_name:artifact.name});if(error)throw new Error(error.message);
 return true;
 }catch(e){await finishJob(id,'failed',(e as Error).message);return false;}
}
buildStage.maxRetries=0;
async function verifyJob(id:string){
 'use step';
const j=await loadJob(id);if(j.cancel_requested){await finishJob(id,'cancelled');return;}try{await assertJobAccess(j);const {data:r}=await jobsDb().from('revisions').select('*').eq('id',j.expected_revision).single();if(!r)throw new Error('Saved revision unavailable');const report=isFullstack(r.files)?await checkRuntime(r.files,true):{compiled:true,requirements:[],errors:verifySources(r.files).errors};const passed=report.compiled&&!report.errors.length&&(!isFullstack(r.files)||report.requirements.length>0&&report.requirements.every(x=>x.passed));await finishJob(id,passed?'completed':'failed',passed?undefined:'Acceptance checks failed. Saved checkpoints are available.',report);}catch(e){await finishJob(id,'failed',(e as Error).message);}}
verifyJob.maxRetries=0;
async function failedJob(id:string){
 'use step';
await finishJob(id,'failed','Background worker interrupted. Review Usage before preparing another attempt.');}
export async function buildProjectWorkflow(id:string){
 'use workflow';
try{const count=await countStages(id);for(let i=0;i<count;i++){if(!await buildStage(id,i))return;}await verifyJob(id);}catch{await failedJob(id);}}
