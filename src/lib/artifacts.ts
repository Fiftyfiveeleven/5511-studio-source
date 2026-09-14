import {isFullstack,validateFullstack} from './fullstack-project';
import {sourcePathSchema} from './code-patches';
import {rewriteModule,moduleReferences} from './source-modules';
import { z } from 'zod';
import type { SourceFile } from './types';
export const artifactSchema=z.object({name:z.string().min(1).max(80),summary:z.string().min(1).max(4000),files:z.array(z.object({path:sourcePathSchema,content:z.string().max(160000)})).min(1).max(80),sql:z.string().max(50000)});
export function validateArtifact(value:unknown){const result=artifactSchema.parse(value);const paths=result.files.map(f=>f.path);if((!isFullstack(result.files)&&!paths.includes('index.html'))||new Set(paths).size!==paths.length)throw new Error('Output must include one index.html and no duplicate files.');if(JSON.stringify(result.files).length>500000)throw new Error('Project source exceeds 500,000 characters.');if(isFullstack(result.files))validateFullstack(result.files);return result;}
export function validateConnection(url:string,key:string){
 if(!url&&!key)return {url:null,key:null};
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||! /^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname)||parsed.port||parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname))throw new Error('Use your Supabase project URL: https://<project-ref>.supabase.co');
 if(key.startsWith('sb_publishable_')&&key.length>25)return {url:parsed.origin,key};
 try{const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());if(payload.role==='anon'&&payload.ref===parsed.hostname.split('.')[0])return {url:parsed.origin,key};}catch{}
 throw new Error('Use a publishable key or the matching legacy anon key. Secret and service-role keys are never accepted.');
}
export function renderPreview(files:SourceFile[],connection?:{url:string|null;key:string|null}){
 let html=files.find(f=>f.path==='index.html')?.content??'<!doctype html><html><body></body></html>';
 const escape=(value:string)=>value.replace(/</g,'\\u003c');
 const imports:Record<string,string>={};
 for(const file of files.filter(f=>f.path.endsWith('.js'))){try{imports['studio/'+file.path]='data:text/javascript;charset=utf-8,'+encodeURIComponent(rewriteModule(file,files));}catch{imports['studio/'+file.path]='data:text/javascript;charset=utf-8,'+encodeURIComponent(file.content);}}
 html=html.replace(/<link\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,(tag,before,href,after)=>{const css=files.find(f=>f.path===href.replace(/^\.\//,'')&&f.path.endsWith('.css'));return css?'<style>'+css.content.replace(/<\/style/gi,'<\\/style')+'</style>':tag;});
 const scriptFor=(name:string,explicitModule=false)=>{const file=files.find(f=>f.path===name);if(!file)return '';let module=explicitModule;try{module=module||moduleReferences(file.content).length>0||/^\s*export\b/m.test(file.content)}catch{}return module?'<script type="module">import '+JSON.stringify('studio/'+name)+';</script>':'<script>'+file.content.replace(/<\/script/gi,'<\\/script')+'</script>';};
 let hasApp=false;
 html=html.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,(tag,src)=>{const name=src.replace(/^\.\//,'');if(name==='app.js')hasApp=true;return imports['studio/'+name]?scriptFor(name,/\btype=["']module["']/i.test(tag)):tag;});
 if(!/<link\b[^>]*href=["'](?:\.\/)?styles\.css["']/i.test(files.find(f=>f.path==='index.html')?.content??'')&&files.some(f=>f.path==='styles.css'))html='<style>'+files.find(f=>f.path==='styles.css')!.content.replace(/<\/style/gi,'<\\/style')+'</style>'+html;
 const config=escape(JSON.stringify({supabaseUrl:connection?.url??'',supabaseKey:connection?.key??''}));
 const head='<meta name="viewport" content="width=device-width, initial-scale=1"><script>window.STUDIO_CONFIG='+config+';</script><script type="importmap">'+escape(JSON.stringify({imports}))+'</script>';
 html=/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,m=>m+head):head+html;
 return html+(!hasApp&&imports['studio/app.js']?scriptFor('app.js'):'');
}
