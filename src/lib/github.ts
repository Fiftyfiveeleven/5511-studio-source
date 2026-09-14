import {isFullstack,fullstackPath} from './fullstack-project';
import {sourcePathSchema} from './code-patches';
import {HttpError} from './server';
import {renderPreview,validateArtifact} from './artifacts';
import type {SourceFile} from './types';
export async function github(token:string,path:string,method='GET',body?:unknown){
 const r=await fetch('https://api.github.com'+path,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new HttpError(r.status===401?401:r.status===404?404:409,r.status===401?'GitHub connection expired. Reconnect in Settings.':r.status===404?'GitHub repository or branch was not found. Check the name and token access.':r.status===403?'GitHub denied this action. Check repository permissions, organization approval, and rate limits.':'GitHub could not accept this change. The repository may have changed, or its rules may require a pull request. No force push was made.');
 return r.status===204?null:r.json();
}
export function repositoryPath(repository:string){if(!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(repository)||repository.split('/')[1]==='..')throw new HttpError(400,'Use a repository name like owner/project.');return '/repos/'+repository}
function githubExportSource(input:{projectId:string;name:string;files:SourceFile[];sql:string;url:string|null;key:string|null}){
 const app=validateArtifact({name:input.name,summary:'GitHub export',files:input.files,sql:input.sql});
 if(isFullstack(app.files))return [...app.files,{path:'schema.sql',content:app.sql||'-- No schema.'},{path:'.5511/project.json',content:JSON.stringify({projectId:input.projectId,name:input.name})},{path:'vercel.json',content:JSON.stringify({framework:'nextjs'})},{path:'.gitignore',content:'node_modules/\n.next/\n.env*\n!.env.example\n'},{path:'.env.example',content:'NEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\n'},{path:'README.md',content:'# '+input.name+'\n\nNext.js application. Run npm install, npm run dev. Import in Vercel with the Next.js preset. Configure this app’s own Supabase connection in environment settings; review schema.sql before applying. No Studio or provider secrets are exported. Acceptance requirements are in studio.tests.json.\n'}];
 // Vercel serves the configured standalone page at the root. Original source stays separate.
 return [{path:'index.html',content:renderPreview(app.files,{url:input.url,key:input.key})},...app.files.map(f=>({path:'source/'+f.path,content:f.content})),{path:'schema.sql',content:app.sql||'-- No database schema.'},{path:'vercel.json',content:JSON.stringify({version:2,framework:null,buildCommand:null,outputDirectory:'.'},null,2)},{path:'.5511/project.json',content:JSON.stringify({projectId:input.projectId,name:input.name},null,2)},{path:'README.md',content:`# ${input.name}\n\nBuilt with 5511 Studio. Import this GitHub repository in Vercel, select Other as the framework, leave the build command empty, and use the repository root as the output directory. Vercel deploys new commits automatically after you connect it.\n\nindex.html is the standalone app; original editable source is in source/. Review schema.sql before applying it to this app's Supabase project. Only public Supabase connection details are included.\n\nEdit files in source/ to sync changes back into Studio. Use the GitHub sync panel to review and merge before publishing again.\n`}];
}
export function exportGithubFiles(input:Parameters<typeof githubExportSource>[0]){const files=githubExportSource(input);files.find(f=>f.path==='.5511/project.json')!.content=JSON.stringify({projectId:input.projectId,name:input.name,managedPaths:files.map(f=>f.path)});return files;}
export async function pushGithub(token:string,input:{projectId:string;name:string;repository:string;branch:string;files:SourceFile[];sql:string;url:string|null;key:string|null;expectedHead?:string|null}){
 const root=repositoryPath(input.repository);const refPath='/git/ref/heads/'+encodeURIComponent(input.branch);
 const repo=await github(token,root);if(!repo.permissions?.push)throw new HttpError(403,'This GitHub account needs write access to the repository.');
 const ref=await github(token,root+refPath);const head=ref.object.sha;if(input.expectedHead&&head!==input.expectedHead)throw new HttpError(409,'GitHub changed since your last sync. Pull and review changes before publishing.');const commit=await github(token,root+'/git/commits/'+head);const tree=await github(token,root+'/git/trees/'+commit.tree.sha+'?recursive=1');
 if(tree.truncated)throw new HttpError(409,'This repository is too large for Studio publishing. Choose a dedicated repository.');
 let binding:{projectId:string;managedPaths?:string[]}|undefined;const marker=tree.tree.find((f:{path:string})=>f.path==='.5511/project.json');
 if(marker){const blob=await github(token,root+'/git/blobs/'+marker.sha);try{binding=JSON.parse(Buffer.from(blob.content,'base64').toString('utf8'))}catch{throw new HttpError(409,'Repository project marker is invalid.');}if(binding?.projectId!==input.projectId)throw new HttpError(409,'This repository belongs to another Studio project. Choose a separate repository.');}
 else if(tree.tree.some((f:{type:string;path:string})=>f.type==='blob'&&!['README.md','.gitignore','LICENSE'].includes(f.path)))throw new HttpError(409,'Choose a new repository or one containing only README, LICENSE, and .gitignore. Studio will not replace an unrelated app.');
 if(marker&&!input.expectedHead)throw new HttpError(409,'Pull and review this existing repository before publishing.');
 if(binding?.managedPaths&&(!Array.isArray(binding.managedPaths)||binding.managedPaths.length>100||binding.managedPaths.some(p=>typeof p!=='string')))throw new HttpError(409,'Repository managed-file list is invalid.');
 const files=exportGithubFiles(input);
 const managed=files.map(f=>f.path);const markerFile=files.find(f=>f.path==='.5511/project.json')!;markerFile.content=JSON.stringify({projectId:input.projectId,name:input.name,managedPaths:managed});
 const editable=(path:string)=>path.startsWith('source/')?sourcePathSchema.safeParse(path.slice(7)).success:fullstackPath.test(path);
 const legacyManaged:string[]=tree.tree.filter((f:{path:string;type:string})=>f.type==='blob'&&editable(f.path)).map((f:{path:string})=>f.path);
 const deleted=(binding?.managedPaths??legacyManaged).filter(path=>!managed.includes(path)&&tree.tree.some((f:{path:string})=>f.path===path));
 if(deleted.some(path=>!editable(path)))throw new HttpError(409,'Repository marker contains unexpected managed paths.');
 // Reuse Git object hashes to avoid empty duplicate commits.
 const {createHash}=await import('node:crypto');
 const generatedOnce=new Set(['README.md','vercel.json','.gitignore','.env.example']);
 const changed=files.filter(f=>{if(marker&&generatedOnce.has(f.path))return false;const bytes=Buffer.from(f.content);const sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');return !tree.tree.some((old:{path:string;sha:string})=>old.path===f.path&&old.sha===sha)});
 if(!changed.length&&!deleted.length)return {repository:input.repository,branch:input.branch,sha:head,url:`https://github.com/${input.repository}/commit/${head}`,unchanged:true};
 const newTree=await github(token,root+'/git/trees','POST',{base_tree:commit.tree.sha,tree:[...changed.map(f=>({...f,mode:'100644',type:'blob'})),...deleted.map(path=>({path,mode:'100644',type:'blob',sha:null}))]});
 const next=await github(token,root+'/git/commits','POST',{message:`Update ${input.name} from 5511 Studio`,tree:newTree.sha,parents:[head]});
 await github(token,root+'/git/refs/heads/'+encodeURIComponent(input.branch),'PATCH',{sha:next.sha,force:false});
 return {repository:input.repository,branch:input.branch,sha:next.sha,url:`https://github.com/${input.repository}/commit/${next.sha}`,unchanged:false};
}
