'use client';
import {buildDisplay,savedWithCheckWarning,type PreviewState} from '@/lib/build-display';
import {useEffect,useState,useRef} from 'react';
import type {Project,Revision} from '@/lib/types';
function active(job:any){return ['queued','running'].includes(job.status)}
function elapsed(created:string){const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(created))/1000));return `${Math.floor(seconds/60)}m ${seconds%60}s`;}
export default function BackgroundBuilds({project,api,onUpdate,onActive,onStatus,previewState}:{project:Project;api:(p:string,m?:string,b?:unknown)=>Promise<any>;onUpdate:(p:Project,r:Revision[])=>void;onActive?:(active:boolean)=>void;onStatus?:(job:any)=>void;previewState?:PreviewState}){
 const statusCallback=useRef(onStatus);statusCallback.current=onStatus;
 const update=useRef(onUpdate);update.current=onUpdate;const activeCallback=useRef(onActive);activeCallback.current=onActive;
 const [jobs,setJobs]=useState<any[]>([]),[error,setError]=useState('');
 useEffect(()=>{setJobs([]);setError('');if(!project.owner_id)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;let version='';async function poll(){try{const d=await api(`/api/projects/${project.id}/jobs`);if(stopped)return;const builds=d.jobs.filter((j:any)=>j.plan.stages.length>0);activeCallback.current?.(builds.some(active));setJobs(builds);statusCallback.current?.(builds.find(active)??builds[0]??null);setError('');const next=builds.map((j:any)=>j.stage+j.status).join();if(next!==version){const fresh=await api('/api/projects/'+project.id);if(!stopped)update.current(fresh.project,fresh.revisions);}version=next;}catch(e){if(!stopped)setError((e as Error).message)}finally{if(!stopped)timer=setTimeout(poll,5000)}}void poll();return()=>{stopped=true;clearTimeout(timer)}},[project.id,project.owner_id]);
 if(!project.owner_id||!jobs.length&&!error)return null;
 const current=jobs.find(active)??jobs[0];
 const display=buildDisplay({active:!!current&&active(current),progress:current?.progress,saved:!!current?.stage,failed:current?.status==='failed',warning:savedWithCheckWarning(current),preview:previewState});
 return <details key={project.id} className="build-progress build-progress-collapsible" aria-label="Build progress">
 <summary className="build-status-line"><span className="build-status-text" aria-live="polite">{current&&active(current)&&<span className="build-activity"/>}{error?'Progress unavailable':current?.status==='cancelled'?'Build stopped':display.label}</span><span className="build-expand-hint">Details <span className="build-chevron" aria-hidden="true">⌄</span></span></summary>
 <div className="build-progress-details">
 {error&&<p role="alert">Could not refresh progress: {error}</p>}
 {current&&<><div className="build-progress-heading"><strong>{active(current)&&<span className="build-activity"/>}{current.status==='cancelled'?'Build stopped':display.label}</strong>{active(current)&&<span>{elapsed(current.created_at)} elapsed</span>}</div>
 <p className="build-request" title={current.plan.goal}>{current.plan.goal.slice(0,160)}{current.plan.goal.length>160?'…':''}</p><p role="status">{current.cancel_requested&&active(current)?'Stopping after the current operation…':active(current)?current.progress??'Waiting for the build worker to start…':current.status==='completed'||savedWithCheckWarning(current)?display.message:current.error??'Your saved stages are preserved.'}</p>
 <progress aria-label="Stages saved" value={current.stage} max={current.plan.stages.length}/><small>{current.stage} of {current.plan.stages.length} stages saved{active(current)&&current.stage===0?' · The preview appears after the first stage is saved.':''}</small>
 {active(current)&&<p className="build-progress-help">{current.progress?.startsWith('Designing')?'The AI is generating this stage. Code appears when generation and checks finish. ':''}You can leave this page and return later.</p>}
 {active(current)&&<button className="subtle-button" disabled={current.cancel_requested} onClick={async()=>{try{await api(`/api/projects/${project.id}/jobs`,'DELETE');setJobs(v=>v.map(j=>active(j)?{...j,cancel_requested:true}:j));}catch(e){setError((e as Error).message)}}}>Stop build</button>}
 {savedWithCheckWarning(current)&&<ul className="check-warning-list">{current.report.requirements.filter((r:any)=>!r.passed).map((r:any)=><li key={r.id}><strong>{r.description}</strong><p>{/strict mode violation/.test(r.error??'')?'The test matched multiple elements and could not choose one. This does not by itself mean the feature is broken.':r.error||'The check did not pass.'}</p></li>)}</ul>}
 {current.report&&<details><summary>Build checks</summary><pre>{JSON.stringify(current.report,null,2)}</pre></details>}
 {jobs.length>1&&<details className="build-history"><summary>Previous attempts ({jobs.length-1})</summary>{jobs.filter(j=>j.id!==current.id).map(j=><p key={j.id}>{savedWithCheckWarning(j)?'saved · check warning':j.status} · {j.stage}/{j.plan.stages.length} stages saved{j.error&&<> — {j.error}</>}</p>)}</details>}</>}
 </div></details>;
}
