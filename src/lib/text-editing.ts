import type {SourceFile} from './types';
export type TextEdit={id:number;original:string;text:string};
function textNodes(doc:Document){const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);const nodes:Text[]=[];let node;while((node=walker.nextNode())){const parent=node.parentElement;if(parent&&!parent.closest('script,style,textarea,select,svg,canvas,noscript,[contenteditable]')&&node.textContent?.trim())nodes.push(node as Text)}return nodes}
function serialize(doc:Document){return '<!doctype html>\n'+doc.documentElement.outerHTML}
export function markEditableText(source:string){const doc=new DOMParser().parseFromString(source,'text/html');textNodes(doc).forEach((node,id)=>{const span=doc.createElement('span');span.dataset.studioText=String(id);span.dataset.studioOriginal=node.data;span.textContent=node.data;node.replaceWith(span)});return serialize(doc)}
export function applyTextEdits(files:SourceFile[],edits:TextEdit[]):SourceFile[]{
 const source=files.find(f=>f.path==='index.html');if(!source)throw new Error('No page source to edit.');
 const doc=new DOMParser().parseFromString(source.content,'text/html'),nodes=textNodes(doc);
 for(const edit of edits){const node=nodes[edit.id];if(!node||node.data!==edit.original)throw new Error('This text changed since editing began. Reopen text editing to try again.');if(edit.text.length>10000)throw new Error('Keep each text edit under 10,000 characters.');node.data=edit.text}
 return files.map(f=>f.path==='index.html'?{...f,content:serialize(doc)}:f);
}
