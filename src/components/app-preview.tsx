'use client';
import {designAuditSchema} from '@/lib/design-types';
import {designBridge,type DesignAudit} from '@/lib/design-bridge';
import {useEffect,useRef,useState} from 'react';
import {verifyPreview} from '@/lib/preview-checks';
import type {SourceFile} from '@/lib/types';
import type {TextEdit} from '@/lib/text-editing';
import {RotateCcw} from 'lucide-react';
// Intercept preview navigation so srcdoc links cannot load Studio inside itself.
export default function AppPreview({html,files,editing=false,onEdit,selecting=false,onSelect,onAudit,auditRequest=0}:{html:string;files?:SourceFile[];editing?:boolean;onEdit?:(edit:TextEdit)=>void;selecting?:boolean;onSelect?:(id:string)=>void;onAudit?:(report:DesignAudit)=>void;auditRequest?:number}){
 const designChannel=useRef('');const callbacks=useRef({onSelect,onAudit});callbacks.current={onSelect,onAudit};
 useEffect(()=>{frame.current?.contentWindow?.postMessage({channel:designChannel.current,action:'select-mode',enabled:selecting},'*')},[selecting]);
 useEffect(()=>{if(auditRequest)frame.current?.contentWindow?.postMessage({channel:designChannel.current,action:'audit'},'*')},[auditRequest]);
 const [checking,setChecking]=useState(false);
 const frame=useRef<HTMLIFrameElement>(null);const editCallback=useRef(onEdit);editCallback.current=onEdit;
 const [src,setSrc]=useState(''),[issue,setIssue]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{
  const channel=crypto.randomUUID();designChannel.current=channel;setIssue('');
  const bridge=`(()=>{const channel=${JSON.stringify(channel)};const editing=${editing};
if(editing){addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('[data-studio-text]').forEach(el=>{el.contentEditable='plaintext-only';el.setAttribute('role','textbox');el.setAttribute('aria-label','Edit text: '+el.textContent.trim().slice(0,60));el.spellcheck=true;el.style.outline='1px dashed #00a3cc';el.style.cursor='text';el.style.minWidth='1ch';el.style.display='inline-block';});});
addEventListener('input',e=>{const el=e.target.closest?.('[data-studio-text]');if(el)parent.postMessage({channel,edit:{id:Number(el.dataset.studioText),original:el.dataset.studioOriginal,text:el.textContent}},'*');},true);
addEventListener('click',e=>{if(e.target.closest?.('[data-studio-text]')){e.preventDefault();e.stopImmediatePropagation();}},true);
addEventListener('keydown',e=>{if(e.target.closest?.('[data-studio-text]')){e.stopImmediatePropagation();if(e.key==='Enter'){e.preventDefault();e.target.blur();}}},true);
}
const send=message=>parent.postMessage({channel:${JSON.stringify(channel)},message:String(message).slice(0,500)},'*');addEventListener('error',e=>send(e.message||'A script failed in this app.'));addEventListener('unhandledrejection',e=>send(e.reason?.message||'An app action failed.'));addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(!a)return;const href=a.getAttribute('href')||'';if(href.startsWith('#')){e.preventDefault();let id;try{id=decodeURIComponent(href.slice(1))}catch{return}const section=document.getElementById(id);if(section)section.scrollIntoView({behavior:'smooth'});else if(!id)scrollTo(0,0);else send('The section '+href+' does not exist in this version.');return;}if(href&&!e.defaultPrevented){e.preventDefault();send('This preview kept you here. Link destination: '+href+'. External links and separate pages can be tested after publishing.');}});})();`;
  const content=html.replace(/<base\b[^>]*>/gi,'');
  const script='<script>'+designBridge(channel)+bridge+'</script>';
  const documentHtml=/<head[^>]*>/i.test(content)?content.replace(/<head[^>]*>/i,m=>m+script):script+content;
  setSrc(documentHtml);
  const onMessage=(event:MessageEvent)=>{if(event.source!==frame.current?.contentWindow||event.data?.channel!==channel)return;if(event.data.kind==='studio-design'){if(typeof event.data.selected==='string')callbacks.current.onSelect?.(event.data.selected.slice(0,220));const report=designAuditSchema.safeParse(event.data.report);if(report.success)callbacks.current.onAudit?.(report.data);}if(typeof event.data.message==='string')setIssue(event.data.message.slice(0,500));const e=event.data.edit;if(editing&&e&&Number.isInteger(e.id)&&e.id>=0&&typeof e.original==='string'&&typeof e.text==='string'&&e.text.length<=10000)editCallback.current?.(e)};
  window.addEventListener('message',onMessage);
  return()=>{window.removeEventListener('message',onMessage)};
 },[html,reload,editing]);
 return <><div className="preview-recovery"><span>{issue||(editing?'Click outlined text to edit · Save text edits when finished':'Preview only · navigation and reload use no AI tokens')}</span>{files&&<button disabled={editing||checking} onClick={async()=>{setChecking(true);try{const r=await verifyPreview(files);setIssue(r.errors.length?'Checks failed: '+r.errors.join('; '):`${r.checks} checks passed. ${r.warnings.length} warnings. `+r.warnings.join('; '));}finally{setChecking(false)}}}>{checking?'Checking…':'Check preview · free'}</button>}<button disabled={editing} onClick={()=>setReload(n=>n+1)} title="Reload saved preview without AI"><RotateCcw size={13}/>Reload preview</button></div>{src&&<iframe ref={frame} onLoad={()=>frame.current?.contentWindow?.postMessage({channel:designChannel.current,action:'select-mode',enabled:selecting},'*')} title="Generated app preview" sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" key={reload} srcDoc={src}/>}</>;
}
