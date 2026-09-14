import {HttpError} from './server';
export type Provider='openai'|'vercel'|'team'|'github';
export const cookieName=(provider:Provider)=>`studio_${provider}`;
export function credential(request:Request,provider:Provider){
 const entry=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName(provider)+'='));
 if(!entry)return '';
 try{return decodeURIComponent(entry.slice(entry.indexOf('=')+1))}catch{return ''}
}
export function requireSameOrigin(request:Request){
 const origin=request.headers.get('origin');
 const url=new URL(request.url);
 let expected=url.origin;
 // Next.js can reconstruct a loopback request URL using "localhost" even
 // when the browser requested 127.0.0.1. Honor the actual loopback Host only,
 // with the same protocol/port; do not trust forwarded hosts or external names.
 const loopback=new Set(['localhost','127.0.0.1','[::1]']);
 const host=request.headers.get('host');
 if(loopback.has(url.hostname)&&host){
  try{const actual=new URL(`${url.protocol}//${host}`);
   if(loopback.has(actual.hostname)&&actual.port===url.port&&actual.host===host&&!actual.username&&!actual.password&&actual.pathname==='/'&&!actual.search&&!actual.hash)expected=actual.origin;
  }catch{}
 }
 if(!origin||origin!==expected)throw new HttpError(403,'This request came from a different address. Reload Studio and try again.');
}
export function secureRequest(request:Request){const url=new URL(request.url);return url.protocol==='https:';}
export function credentialTransport(request:Request){const url=new URL(request.url);if(!secureRequest(request)&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new HttpError(400,'Open Studio over HTTPS to save credentials.');}
