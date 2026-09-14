import {parse} from 'acorn';
import type {SourceFile} from './types';
export function moduleReferences(code:string){
 const tree=parse(code,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});const refs:{start:number;end:number;value:string}[]=[];
 function visit(node:any){if(!node||typeof node!=='object')return;if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration','ImportExpression'].includes(node.type)&&node.source){if(typeof node.source.value!=='string')throw new Error('Dynamic module imports must use a literal path.');refs.push({start:node.source.start,end:node.source.end,value:node.source.value});}for(const [key,value] of Object.entries(node)){if(key==='source')continue;if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}}
 visit(tree);return refs;
}
export function resolveModule(from:string,specifier:string){
 if(/^https:\/\/esm\.sh\//.test(specifier))return specifier;
 if(!specifier.startsWith('./')&&!specifier.startsWith('../'))throw new Error(`Unsupported module import: ${specifier}`);
 const parts=from.split('/').slice(0,-1);for(const part of specifier.split('/')){if(part==='.'||!part)continue;if(part==='..'){if(!parts.length)throw new Error('Module import escapes project.');parts.pop();}else parts.push(part);}return parts.join('/');
}
export function rewriteModule(file:SourceFile,files:SourceFile[]){let code=file.content;const refs=moduleReferences(code);for(const ref of refs.reverse()){const target=resolveModule(file.path,ref.value);if(target.startsWith('https://'))continue;if(!files.some(f=>f.path===target&&f.path.endsWith('.js')))throw new Error(`Missing JavaScript module: ${target}`);code=code.slice(0,ref.start)+JSON.stringify('studio/'+target)+code.slice(ref.end);}return code;}
export function verifySources(files:SourceFile[]){const errors:string[]=[];for(const file of files.filter(f=>f.path.endsWith('.js'))){try{rewriteModule(file,files)}catch(e){errors.push(`${file.path}: ${(e as Error).message}`)}}const html=files.find(f=>f.path==='index.html')?.content??'';
 for(const match of html.matchAll(/<(script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)){const dest=match[2];if(/^(?:https?:|data:|#|\/\/)/.test(dest))continue;const name=dest.replace(/^\.\//,'');if(!files.some(f=>f.path===name))errors.push(`Missing local resource: ${name}`);}
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=|application\/(?:ld\+)?json|importmap/i.test(match[1])||!match[2].trim())continue;try{parse(match[2],{ecmaVersion:'latest',sourceType:/type=["']module/.test(match[1])?'module':'script'})}catch(e){errors.push(`Inline script: ${(e as Error).message}`)}}return {errors:[...new Set(errors)].slice(0,20),checkedFiles:files.length};
}
