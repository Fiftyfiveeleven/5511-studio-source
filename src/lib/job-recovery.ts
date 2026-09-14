import {getRun} from 'workflow/api';
import {jobsDb} from './job-store';

// Only a confirmed terminal worker can release an active project. Timeouts or
// unavailable status checks must never launch a duplicate, potentially paid run.
export async function reconcileProjectJobs(projectId:string, readStatus=(id:string)=>getRun(id).status){
 const db=jobsDb();
 const {data,error}=await db.from('studio_build_jobs').select('id,workflow_id').eq('project_id',projectId).in('status',['queued','running']);
 if(error)throw new Error('Background job status could not be checked.');
 for(const job of data??[]){
  if(!job.workflow_id)continue;
  let status:string;
  try{status=await readStatus(job.workflow_id);}catch{continue;}
  if(!['failed','cancelled','completed'].includes(status))continue;
  const message=status==='cancelled'?'Background worker was cancelled. Saved stages are preserved.':status==='completed'?'Worker stopped without recording a final build result. Saved stages are preserved. Prepare a fresh plan.':'Background worker failed. Saved stages and usage are preserved. Prepare a fresh plan after checking the deployment workflow logs.';
  const {data:changed,error:updateError}=await db.from('studio_build_jobs').update({status:status==='cancelled'?'cancelled':'failed',error:message,updated_at:new Date().toISOString()}).eq('id',job.id).in('status',['queued','running']).select('id');
  if(updateError)throw new Error('Worker failure could not be saved.');
  if(changed?.length)await db.from('studio_job_secrets').delete().eq('job_id',job.id);
 }
}

export function enqueueError(error:{code?:string;message?:string}){
 if(error.code==='23505')return {status:409,message:'This project already has an active background build. Open Background builds to see its progress.'};
 if(error.message?.includes('Background job limit reached'))return {status:429,message:'The limit of 20 background jobs in 24 hours was reached. Try again after an earlier job leaves that window.'};
 return {status:503,message:'Background job storage is unavailable. Check the Studio Supabase connection and background job migration.'};
}
