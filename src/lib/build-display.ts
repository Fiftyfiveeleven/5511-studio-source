export type PreviewState='loading'|'ready'|'error';
export function buildDisplay({active,progress,saved,failed,warning,preview}:{active:boolean;progress?:string;saved:boolean;failed?:boolean;warning?:boolean;preview?:PreviewState}){
 if(active)return {ready:false,label:progress?.startsWith('Designing')?'Updating your app':progress?.startsWith('Saving')?'Saving your changes':saved?'Changes saved · Finishing checks':'Building your app',message:progress||'Your request is still running. The saved version is a checkpoint.'};
 if(failed&&!warning)return {ready:false,label:'Build needs attention',message:'Changes are saved, but the final checks did not complete successfully. Open Details to review.'};
 if(preview==='error')return {ready:false,label:'Changes saved · Preview needs attention',message:'Your changes are saved. The preview could not update; use Retry preview.'};
 if(preview==='loading')return {ready:false,label:'Changes saved · Updating preview',message:'Checks have finished. Your previous preview stays visible until the latest version loads.'};
 if(warning)return {ready:false,label:'Changes saved · Check warning',message:'Your changes are saved and the preview is available. An automated check could not verify everything. Open Details for the specific warning.'};
 return {ready:true,label:'Ready to review',message:'Your changes are saved and the latest preview has loaded.'};
}

export function savedWithCheckWarning(job:any){return !!job&&job.status==='failed'&&job.stage>0&&job.stage===job.plan?.stages?.length&&job.report?.compiled===true&&job.report?.errors?.length===0&&job.report?.requirements?.some((r:any)=>!r.passed);}
