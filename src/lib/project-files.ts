import type {SourceFile} from './types';
import {sourcePathSchema} from './code-patches';
import {isFullstack,fullstackPath} from './fullstack-project';

export function fileMatches(files:SourceFile[],query:string,contents=false){
 const term=query.trim().toLowerCase();
 return files.filter(f=>!term||f.path.toLowerCase().includes(term)||(contents&&f.content.toLowerCase().includes(term))).sort((a,b)=>a.path.localeCompare(b.path));
}
export function requiredFile(files:SourceFile[],path:string){return (isFullstack(files)?['package.json','app/layout.tsx','app/page.tsx']:['index.html']).includes(path)}
export function checkFilePath(files:SourceFile[],path:string,previous?:string){
 if(!sourcePathSchema.safeParse(path).success||(isFullstack(files)&&!fullstackPath.test(path))||(!isFullstack(files)&&path==='package.json'))throw new Error('Unsupported path. Use a project source path, such as components/example.'+(isFullstack(files)?'tsx':'js')+'.');
 if(files.some(f=>f.path===path&&f.path!==previous))throw new Error('A file already exists at that path.');
 if(files.some(f=>f.path!==previous&&(f.path.startsWith(path+'/')||path.startsWith(f.path+'/'))))throw new Error('A file and folder cannot share the same path.');
}
export function renameProjectFile(files:SourceFile[],from:string,to:string){
 if(!files.some(f=>f.path===from))throw new Error('File not found.');
 if(requiredFile(files,from)&&from!==to)throw new Error('This entry file is required by the app.');
 checkFilePath(files,to,from);return files.map(f=>f.path===from?{...f,path:to}:f);
}
export function removeProjectFile(files:SourceFile[],path:string){
 if(requiredFile(files,path))throw new Error('This entry file is required by the app.');
 return files.filter(f=>f.path!==path);
}
export function fileChanges(before:SourceFile[],after:SourceFile[]){
 const old=new Map(before.map(f=>[f.path,f.content])),next=new Map(after.map(f=>[f.path,f.content]));
 return [...new Set([...old.keys(),...next.keys()])].filter(p=>old.get(p)!==next.get(p)).map(path=>({path,kind:!old.has(path)?'Added':!next.has(path)?'Deleted':'Modified'}));
}
