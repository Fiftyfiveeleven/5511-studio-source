'use client';
import {useEffect,useState,useRef} from 'react';
import type {Project,Revision} from '@/lib/types';
export default function BackgroundBuilds({project,api,onUpdate}:{project:Project;api:(p:string,m?:string,b?:unknown)=>Promise<any>;onUpdate:(p:Project,r:Revision[])=>void}){
 const update=useRef(onUpdate);update.current=onUpdate;
 const [jobs,setJobs]=useState<any[]>([]),[error,setError]=useState('');
 useEffect(()=>{if(!project.owner_id)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;let version='';async function poll(){try{const d=await api(`/api/projects/${project.id}/jobs`);if(stopped)return;setJobs(d.jobs);const next=d.jobs.map((j:any)=>j.updated_at+j.status).join();if(next!==version){const fresh=await api('/api/projects/'+project.id);if(!stopped)update.current(fresh.project,fresh.revisions);}version=next;}catch(e){if(!stopped)setError((e as Error).message)}finally{if(!stopped)timer=setTimeout(poll,5000)}}void poll();return()=>{stopped=true;clearTimeout(timer)}},[project.id,project.owner_id]);
 if(!project.owner_id)return null;
 return <section className="background-jobs"><details><summary>Background builds {jobs.some(j=>['queued','running'].includes(j.status))?'· Running':''}</summary>{error&&<p role="alert">{error}</p>}{!jobs.length&&<p>No background builds yet.</p>}{jobs.map(j=><article key={j.id}><b>{j.plan.goal}</b><p>{j.status} · {j.stage}/{j.plan.stages.length} stages saved</p>{j.error&&<p role="alert">{j.error}</p>}{j.report&&<pre>{JSON.stringify(j.report,null,2)}</pre>}{['queued','running'].includes(j.status)&&<button onClick={()=>api(`/api/projects/${project.id}/jobs`,'DELETE').catch(e=>setError(e.message))}>Cancel after current operation</button>}</article>)}</details></section>;
}
