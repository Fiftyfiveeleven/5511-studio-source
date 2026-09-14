import { z } from 'zod';
import type { SourceFile } from './types';
export const artifactSchema=z.object({name:z.string().min(1).max(80),summary:z.string().min(1).max(4000),files:z.array(z.object({path:z.enum(['index.html','styles.css','app.js']),content:z.string().max(160000)})).min(1).max(3),sql:z.string().max(50000)});
export function validateArtifact(value:unknown){const result=artifactSchema.parse(value);const paths=result.files.map(f=>f.path);if(!paths.includes('index.html')||new Set(paths).size!==paths.length)throw new Error('Output must include one index.html and no duplicate files.');return result;}
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
 const css=files.find(f=>f.path==='styles.css')?.content??'';
 const js=files.find(f=>f.path==='app.js')?.content??'';
 html=html.replace(/<link\b[^>]*href=["'](?:\.\/)?styles\.css["'][^>]*>/gi,'').replace(/<script\b[^>]*src=["'](?:\.\/)?app\.js["'][^>]*>\s*<\/script>/gi,'');
 const config=JSON.stringify({supabaseUrl:connection?.url??'',supabaseKey:connection?.key??''}).replace(/</g,'\\u003c');
 const head=`<meta name="viewport" content="width=device-width, initial-scale=1"><script>window.STUDIO_CONFIG=${config};</script><style>${css.replace(/<\/style/gi,'<\\/style')}</style>`;
 html=/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,m=>m+head):head+html;
 return html+`<script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script>`;
}
