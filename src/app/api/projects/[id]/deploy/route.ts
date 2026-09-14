import {credential,requireSameOrigin} from '@/lib/credentials';
import { NextResponse } from 'next/server';
import { authorize,failure,ownedProject,HttpError } from '@/lib/server';
import { renderPreview } from '@/lib/artifacts';
export const maxDuration=60;
const team=(request:Request)=>(credential(request,'team')||process.env.VERCEL_TEAM_ID)?`?teamId=${encodeURIComponent(credential(request,'team')||process.env.VERCEL_TEAM_ID||'')}`:'';
async function vercel(request:Request,path:string,init?:RequestInit){if(!(credential(request,'vercel')||process.env.VERCEL_TOKEN))throw new HttpError(503,'Connect Vercel in Settings when you are ready to publish.');const r=await fetch(`https://api.vercel.com${path}${team(request)}`,{...init,headers:{Authorization:`Bearer ${credential(request,'vercel')||process.env.VERCEL_TOKEN}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000)});if(!r.ok)throw new HttpError(502,`Vercel could not complete the request (${r.status}). Check the server token and team permissions.`);return r.json();}
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,ctx:Context){try{const {db}=await authorize(request);const {id}=await ctx.params;const project=await ownedProject(db,id);if(!project.current_revision_id)throw new HttpError(400,'Build a version before publishing.');
 const {data:rev,error}=await db.from('revisions').select('*').eq('id',project.current_revision_id).single();if(error)throw error;
 const {data:record,error:recordError}=await db.from('deployments').insert({project_id:id,revision_id:rev.id,state:'SUBMITTING'}).select().single();if(recordError)throw recordError;
 try{const deployment=await vercel(request,'/v13/deployments',{method:'POST',body:JSON.stringify({name:`studio-${id}`,target:'production',files:[{file:'index.html',data:renderPreview(rev.files,{url:project.supabase_url,key:project.supabase_key})},{file:'vercel.json',data:JSON.stringify({rewrites:[{source:'/(.*)',destination:'/index.html'}],headers:[{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'}]}]})}],projectSettings:{framework:null,buildCommand:null,installCommand:null,outputDirectory:null}})});
 const {error:saveError}=await db.from('deployments').update({vercel_id:deployment.id,url:`https://${deployment.url}`,state:deployment.readyState||'QUEUED'}).eq('id',record.id);if(saveError)throw saveError;
 if(deployment.projectId){const {error:e}=await db.from('projects').update({vercel_project_id:deployment.projectId}).eq('id',id);if(e)throw e;}
 return NextResponse.json({id:record.id,state:deployment.readyState||'QUEUED',url:`https://${deployment.url}`});
 }catch(e){await db.from('deployments').update({state:'ERROR'}).eq('id',record.id);throw e;}
 }catch(e){return failure(e)}}
export async function GET(request:Request,ctx:Context){try{const {db}=await authorize(request);const {id}=await ctx.params;await ownedProject(db,id);const {data:deployment,error}=await db.from('deployments').select('*').eq('project_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;if(!deployment)return NextResponse.json(null);if(!deployment.vercel_id||['READY','ERROR','CANCELED'].includes(deployment.state))return NextResponse.json(deployment);
 const live=await vercel(request,`/v13/deployments/${encodeURIComponent(deployment.vercel_id)}`);const state=live.readyState||live.status;const {error:e}=await db.from('deployments').update({state}).eq('id',deployment.id);if(e)throw e;
 if(state==='READY'){const {error:p}=await db.from('projects').update({deployment_url:deployment.url}).eq('id',id);if(p)throw p;}
 return NextResponse.json({...deployment,state});}catch(e){return failure(e)}}
