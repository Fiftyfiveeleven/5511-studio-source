import {makeBuildPlan} from './project-memory';
import {isFullstack,fullstackTemplate} from './fullstack-project';
import type {Project,Revision} from './types';
import type {ImageAttachment} from './attachments';
export async function submitChatBuild(project:Project,current:Revision|null,prompt:string,images:ImageAttachment[],api:(path:string,method?:string,body?:unknown)=>Promise<any>){
 const runtime=!current||isFullstack(current.files)?'nextjs':'browser';
 const plan=makeBuildPlan(prompt,!current,!current);
 plan.baseRevision=current?.id??null;
 const quote=await api('/api/estimate','POST',{prompt:plan.stages[0].instruction,name:project.name,files:current?.files??fullstackTemplate(),previousSql:current?.sql??'',previousTurn:current?{prompt:(current.prompt??'').slice(0,6000),summary:(current.summary??'').slice(0,10000)}:undefined,connected:!!project.supabase_url,specification:project.specification,images});
 if(quote.blockedReason)throw new Error(quote.blockedReason);
 if(runtime==='nextjs')return {job:await api(`/api/projects/${project.id}/jobs`,'POST',{plan,images,runtime})};
 return {revision:await api(`/api/projects/${project.id}/generate`,'POST',{prompt,images,requestId:plan.stages[0].id,buildId:plan.id,budgetUsd:plan.budgetUsd,expectedRevision:current?.id??null})};
}
