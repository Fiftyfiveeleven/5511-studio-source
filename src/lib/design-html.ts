import type {SourceFile} from './types';
import {type DesignChange,type DesignElement,styleProperties,validateDesignValue} from './design-types';
function elements(doc:Document){return [...doc.body.querySelectorAll<HTMLElement>('*')].filter(el=>!el.closest('script,style,svg,noscript,template'));}
export function htmlDesignElements(files:SourceFile[]):DesignElement[]{const doc=new DOMParser().parseFromString(files.find(f=>f.path==='index.html')?.content??'','text/html');return elements(doc).map((el,i)=>({id:'index.html:'+i,path:'index.html',tag:el.tagName.toLowerCase(),label:(el.textContent||el.getAttribute('alt')||el.tagName).trim().slice(0,80),text:el.children.length?null:el.textContent,attributes:Object.fromEntries([...el.attributes].map(a=>[a.name,a.value])),styles:Object.fromEntries(styleProperties.map(p=>[p,el.style[p]])),styleEditable:true}));}
export function instrumentHtml(content:string){const doc=new DOMParser().parseFromString(content,'text/html');elements(doc).forEach((el,i)=>el.dataset.studioElement='index.html:'+i);return '<!doctype html>\n'+doc.documentElement.outerHTML;}
export function applyHtmlDesignChange(files:SourceFile[],change:DesignChange){validateDesignValue(change);const source=files.find(f=>f.path==='index.html');if(!source)throw new Error('No HTML source.');const doc=new DOMParser().parseFromString(source.content,'text/html');const el=elements(doc)[Number(change.id.split(':')[1])];if(!el)throw new Error('Element changed. Select it again.');
 if(change.property==='text'){if(el.children.length)throw new Error('Select an element with plain text.');el.textContent=change.value;}
 else if((styleProperties as readonly string[]).includes(change.property))el.style[change.property as typeof styleProperties[number]]=change.value;
 else{if(change.property==='href'&&el.tagName!=='A'||['src','alt'].includes(change.property)&&el.tagName!=='IMG')throw new Error('Attribute does not apply to this element.');el.setAttribute(change.property,change.value);}
 return files.map(f=>f.path==='index.html'?{...f,content:'<!doctype html>\n'+doc.documentElement.outerHTML}:f);
}
