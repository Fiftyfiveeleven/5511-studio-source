import {github,repositoryPath} from './github';
import {HttpError} from './server';
import {validateArtifact} from './artifacts';
import {fullstackPath} from './fullstack-project';
import {sourcePathSchema} from './code-patches';
import type {SourceFile} from './types';
export async function readGithubSource(token:string,repository:string,branch:string,projectId:string,sha?:string,cache=new Map<string,Promise<string>>()){
 const root=repositoryPath(repository);const head=sha??(await github(token,root+'/git/ref/heads/'+encodeURIComponent(branch))).object.sha;
 if(!/^[a-f0-9]{40}$/.test(head))throw new HttpError(400,'Invalid Git commit.');
 const commit=await github(token,root+'/git/commits/'+head),tree=await github(token,root+'/git/trees/'+commit.tree.sha+'?recursive=1');
 if(tree.truncated)throw new HttpError(409,'Use a dedicated repository with a smaller source tree.');
 const blob=async(entry:{sha:string;size:number;mode:string})=>{if(entry.mode!=='100644'&&entry.mode!=='100755')throw new HttpError(400,'Symlinks and submodules cannot be imported.');if(entry.size>200000)throw new HttpError(400,'A GitHub file is too large to import.');const cached=cache.get(entry.sha);if(cached)return cached;const pending=(async()=>{const b=await github(token,root+'/git/blobs/'+entry.sha);if(b.encoding!=='base64'||b.size>200000)throw new HttpError(400,'Unsupported GitHub file.');const text=Buffer.from(b.content,'base64').toString('utf8');if(text.includes('\0'))throw new HttpError(400,'Binary files cannot be imported as source.');return text;})();cache.set(entry.sha,pending);return pending;};
 const marker=tree.tree.find((f:{path:string})=>f.path==='.5511/project.json');
 if(!marker)throw new HttpError(409,'Publish this Studio project once before pulling changes.');
 let binding;try{binding=JSON.parse(await blob(marker))}catch{throw new HttpError(409,'Invalid Studio repository marker.');}
 if(binding.projectId!==projectId)throw new HttpError(409,'This repository belongs to a different Studio project.');
 const next=tree.tree.some((f:{path:string})=>f.path==='package.json');const source=tree.tree.filter((f:{path:string;type:string})=>f.type==='blob'&&(f.path==='schema.sql'||(next?fullstackPath.test(f.path):f.path.startsWith('source/')&&sourcePathSchema.safeParse(f.path.slice(7)).success)));
 if(source.length>81||source.reduce((n:number,f:{size:number})=>n+(f.size||0),0)>650000)throw new HttpError(400,'Repository source exceeds Studio limits.');
 const files:SourceFile[]=[];for(let i=0;i<source.length;i+=4)files.push(...await Promise.all(source.slice(i,i+4).map(async(entry:{path:string;sha:string;size:number;mode:string})=>({path:entry.path==='schema.sql'?'schema.sql':next?entry.path:entry.path.slice(7),content:await blob(entry)}))));
 const app=validateArtifact({name:'GitHub version',summary:'Imported source',files:files.filter(f=>f.path!=='schema.sql'),sql:files.find(f=>f.path==='schema.sql')?.content??''});
 return {head,files:[...app.files,{path:'schema.sql',content:app.sql}],name:binding.name};
}
