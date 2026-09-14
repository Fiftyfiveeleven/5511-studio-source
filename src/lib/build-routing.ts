import type {SourceFile} from './types';
export type RoutingInfo={tier:'fast'|'capable';reason:string;contextFiles:string[];omittedCharacters:number};
export function routeBuild(prompt:string,files:SourceFile[],hasImages:boolean){
 const text=prompt.trim();
 // Only narrowly phrased visual edits qualify. Ambiguous, compound, functional,
 // screenshot and first-build requests keep the capable model and full context.
 const visual=/^(?:please\s+)?(?:change|make|set|adjust|increase|decrease)\b.{0,180}\b(?:colou?r|background|font|spacing|padding|margin|border|radius|shadow|size)\b/i.test(text);
 const complex=/\b(?:and|also|then|add|remove|replace|rebuild|redesign|layout|responsive|mobile|animation|click|login|auth|database|supabase|api|form|function|behavior|behaviour|javascript)\b|[\n;]/i.test(text);
 const html=files.find(f=>f.path==='index.html')?.content??'';
 const js=files.find(f=>f.path==='app.js')?.content??'';
 const dynamic=/innerHTML|outerHTML|insertAdjacentHTML|createElement|\.style\b|classList|setAttribute/.test(js)||/<style\b|\sstyle\s*=/i.test(html);
 const focused=files.some(f=>f.path==='styles.css')&&!!html&&!hasImages&&files.length<=3&&text.length<=220&&visual&&!complex&&!dynamic;
 const selected=focused?files.filter(f=>f.path!=='app.js'):files;
 const info:RoutingInfo={tier:focused?'fast':'capable',reason:focused?'Simple visual edit; HTML and stylesheet context.':!files.length?'New app; full build context.':hasImages?'Visual reference supplied; full context.':'Complex or uncertain change; full context.',contextFiles:selected.map(f=>f.path),omittedCharacters:files.filter(f=>!selected.includes(f)).reduce((n,f)=>n+f.content.length,0)};
 return {model:focused?(process.env.OPENAI_FAST_MODEL||'gpt-5.4-mini'):(process.env.OPENAI_MODEL||'gpt-5.5'),files:selected,editable:focused?['styles.css']:['index.html','styles.css','app.js'],focused,info};
}
export function checkRoutingScope(value:unknown,editable:string[],focused:boolean){
 if(!focused)return;
 const delta=value as {files?:{path:string}[];sql?:unknown};
 if(!Array.isArray(delta.files)||delta.files.some(f=>!editable.includes(f.path))||delta.sql!==null)throw new Error('Focused edit changed files outside its allowed scope.');
}
