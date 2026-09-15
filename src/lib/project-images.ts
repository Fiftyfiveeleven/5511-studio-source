import type {ImageAttachment} from './attachments';
import type {authorize} from './server';
import {HttpError} from './server';
export type ProjectImage={id:string;label:string;prompt:string;status:'generating'|'ready'|'failed';data_url:string|null;error:string|null;created_at:string;model:string;cost_usd:number|null};
export function selectLibraryImages(rows:ProjectImage[],prompt:string,supplied:ImageAttachment[]=[]){
 const text=prompt.toLowerCase();
 const ranked=rows.filter(r=>r.status==='ready'&&r.data_url).map(r=>({r,score:text.includes(r.label.toLowerCase())?100:r.label.toLowerCase().split(/\W+/).filter(w=>w.length>3&&text.includes(w)).length})).sort((a,b)=>b.score-a.score);
 const chosen=ranked.filter(x=>x.score>0).slice(0,3-supplied.length);
 if(!chosen.length&&/\b(images?|photos?|pictures?|illustrations?|hero|banner)\b/i.test(prompt))chosen.push(...ranked.slice(0,3-supplied.length));
 return [...supplied,...chosen.filter(x=>!supplied.some(i=>i.dataUrl===x.r.data_url)).map(({r})=>({name:r.label,dataUrl:r.data_url!,useAs:'asset' as const}))];
}
export async function projectImageContext(db:Awaited<ReturnType<typeof authorize>>['db'],id:string,prompt:string,supplied:ImageAttachment[]=[]){
 const {data,error}=await db.from('studio_project_images').select('id,label,status').eq('project_id',id).eq('status','ready').order('created_at',{ascending:false}).limit(100);
 if(error)throw new HttpError(503,'The project image library is unavailable. Please check Studio storage.');
 const rows=(data??[]).map(r=>({...r,data_url:'library:'+r.id})) as ProjectImage[];
 const chosen=selectLibraryImages(rows,prompt,supplied).filter(i=>i.dataUrl.startsWith('library:'));
 let selected:ImageAttachment[]=[];if(chosen.length){const result=await db.from('studio_project_images').select('label,data_url').eq('project_id',id).in('id',chosen.map(i=>i.dataUrl.slice(8)));if(result.error)throw new HttpError(503,'Could not load the selected project images.');selected=(result.data??[]).filter(r=>r.data_url).map(r=>({name:r.label,dataUrl:r.data_url,useAs:'asset'}));}
 return {images:[...supplied,...selected.filter(i=>!supplied.some(s=>s.dataUrl===i.dataUrl))],libraryCatalog:rows.map(r=>r.label)};
}
