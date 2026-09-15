import {createHash} from 'node:crypto';
import type {SourceFile} from './types';
import type {ImageAttachment} from './attachments';
export const assetPath=(path:string)=>/^lib\/studio-(?:assets|image-[a-f0-9]{16}(?:-\d+)?)\.[jt]s$/.test(path);
export function assetCatalog(files:SourceFile[]):{symbol:string;name:string}[]{
 const source=files.find(f=>/^lib\/studio-assets\.[jt]s$/.test(f.path))?.content??'';
 try{const items=JSON.parse(source.match(/export const assetCatalog = (.*);/)?.[1]??'[]');return Array.isArray(items)?items.filter(a=>typeof a?.name==='string'&&/^image_[a-f0-9]{16}$/.test(a?.symbol)):[];}catch{return [];}
}
export function attachAssets(files:SourceFile[],images:ImageAttachment[]){
 const ext=files.some(f=>f.path==='package.json')?'ts':'js';const suffix=ext==='ts'?'':'.js';
 const result=new Map(files.map(f=>[f.path,f]));const catalog=assetCatalog(files);
 for(const image of images.filter(i=>i.useAs!=='reference')){
  const hash=createHash('sha256').update(image.dataUrl).digest('hex').slice(0,16),symbol='image_'+hash;
  const existing=catalog.find(a=>a.symbol===symbol);if(existing){existing.name=image.name;continue;}
  const chunks=image.dataUrl.match(/.{1,100000}/g)!;
  chunks.forEach((chunk,i)=>result.set(`lib/studio-image-${hash}-${i}.${ext}`,{path:`lib/studio-image-${hash}-${i}.${ext}`,content:'export default '+JSON.stringify(chunk)+';'}));
  result.set(`lib/studio-image-${hash}.${ext}`,{path:`lib/studio-image-${hash}.${ext}`,content:chunks.map((_,i)=>`import p${i} from './studio-image-${hash}-${i}${suffix}';`).join('\n')+'\nexport default '+chunks.map((_,i)=>'p'+i).join('+')+';'});
  catalog.push({symbol,name:image.name});
 }
 if(catalog.length)result.set(`lib/studio-assets.${ext}`,{path:`lib/studio-assets.${ext}`,content:'export const assetCatalog = '+JSON.stringify(catalog)+';\n'+catalog.map(a=>`export {default as ${a.symbol}} from './studio-image-${a.symbol.slice(6)}${suffix}';`).join('\n')});
 return [...result.values()];
}
export function assetInstructions(files:SourceFile[]){const catalog=assetCatalog(files);return catalog.length?' Uploaded files are installed as immutable app assets. Import the named image exports from lib/studio-assets.js (relative path in browser modules; @/lib/studio-assets in Next.js). Use these data URLs directly in ordinary <img src={image_export} alt="..."> with object-fit:contain and natural proportions. Do not redraw logos, retype logo text, invent URLs, crop logos, or return/modify any lib/studio-assets.js or lib/studio-image-* files. Screenshot references guide layout only when the user asks. Existing assets remain available across messages. When changing image size or layout, keep its existing source and change styling only. An attached screenshot shows the current design; do not install the screenshot as a logo. Asset catalog: '+JSON.stringify(catalog):'';}

export function rememberedImages(files:SourceFile[]):ImageAttachment[]{
 return assetCatalog(files).slice(-3).flatMap(a=>{try{const prefix='lib/studio-image-'+a.symbol.slice(6)+'-';const parts=files.filter(f=>f.path.startsWith(prefix)).sort((a,b)=>Number(a.path.match(/-(\d+)\.[jt]s$/)?.[1])-Number(b.path.match(/-(\d+)\.[jt]s$/)?.[1]));const dataUrl=parts.map(f=>JSON.parse(f.content.slice(15,-1))).join('');return /^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)&&dataUrl.length<=400000?[{name:a.name,dataUrl,useAs:'reference' as const}]:[];}catch{return []}});
}
