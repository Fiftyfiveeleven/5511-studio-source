import {z} from 'zod';
import {renderPreview} from './artifacts';
import {isFullstack} from './fullstack-project';
import {installSection,newSection} from './section-studio';
import type {SourceFile} from './types';
export const aiFeaturePath='components/studio-ai-feature.json';
export const aiFeatureMeta=z.object({version:z.literal(1),id:z.uuid(),height:z.number().int().min(200).max(1400),history:z.array(z.object({prompt:z.string().max(6000),summary:z.string().max(4000)})).max(12)});
export type AiFeatureMeta=z.infer<typeof aiFeatureMeta>;
export function readAiFeature(files:SourceFile[]){const file=files.find(f=>f.path===aiFeaturePath);return file?aiFeatureMeta.parse(JSON.parse(file.content)):null;}
export function featurePreview(files:SourceFile[]){const html=renderPreview(files.filter(f=>f.path!==aiFeaturePath));return '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' data: blob:; style-src \'unsafe-inline\'; img-src data: https:; font-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\';">'+html;}
export function installAiFeature(files:SourceFile[],incoming:SourceFile[],target='app/page.tsx'){
 const meta=readAiFeature(incoming);if(!meta)throw new Error('AI feature metadata is missing.');
 const section=newSection('cta',meta.id),id='section-'+meta.id.replaceAll('-',''),component='Section'+meta.id.replaceAll('-',''),path=`components/${id}.tsx`,doc=featurePreview(incoming);
 const installed=installSection(files,section,target);
 if(isFullstack(files))return installed.map(f=>f.path===path?{...f,content:`export default function ${component}(){return <iframe title="Reusable feature" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={${JSON.stringify(doc)}} style={{width:'100%',height:${meta.height},border:0,display:'block'}}/>}`}:f);
 const escaped=doc.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 // Use the same safe insertion checks as visual sections, replacing only this new section.
 const original=files.find(f=>f.path==='index.html')!;
 return files.map(f=>f===original?{...f,content:f.content.replace(/<\/body\s*>/i,()=>`<iframe id="${id}" title="Reusable feature" sandbox="allow-scripts" referrerpolicy="no-referrer" style="width:100%;height:${meta.height}px;border:0;display:block" srcdoc="${escaped}"></iframe></body>`)}:f);
}
