import type {SourceFile} from './types';
export type FileChange={path:string;kind:'added'|'deleted'|'changed'|'conflict';base:string|null;local:string|null;remote:string|null};
export function mergeSources(base:SourceFile[],local:SourceFile[],remote:SourceFile[],choices:Record<string,'local'|'remote'>={}){
 const map=(files:SourceFile[])=>new Map(files.map(f=>[f.path,f.content]));const b=map(base),l=map(local),r=map(remote),files:SourceFile[]=[],changes:FileChange[]=[],conflicts:string[]=[];
 for(const path of [...new Set([...b.keys(),...l.keys(),...r.keys()])].sort()){const before=b.get(path)??null,mine=l.get(path)??null,theirs=r.get(path)??null;let content:string|null;
  if(mine===theirs)content=mine;else if(mine===before)content=theirs;else if(theirs===before)content=mine;else{const choice=choices[path];if(!choice)conflicts.push(path);content=choice==='remote'?theirs:mine;}
  if(mine!==theirs)changes.push({path,kind:mine!==before&&theirs!==before?'conflict':mine===null?'added':theirs===null?'deleted':'changed',base:before,local:mine,remote:theirs});
  if(content!==null)files.push({path,content});
 }return {files,changes,conflicts};
}

export function sameSources(a:SourceFile[],b:SourceFile[]){return a.length===b.length&&a.every(f=>b.some(x=>x.path===f.path&&x.content===f.content));}
