import {sharedUsageDb,readSharedLedger,writeSharedLedger} from './shared-usage';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {HttpError} from './server';
import {defaultLimits,type Limits,type TokenUsage,type UsageEntry,type UsageSummary} from './usage-types';
export type StoredEntry=UsageEntry&{digest:string;result?:unknown;rawOutput?:string};
type Ledger={limits:Limits;entries:StoredEntry[]};
function location(key:string){
 if(process.env.VERCEL)throw new HttpError(503,'The Studio administrator must configure durable usage storage before enabling hosted builds.');
 const root=process.env.STUDIO_USAGE_DIR||path.join(process.cwd(),'.studio','usage');
 return path.join(/*turbopackIgnore: true*/ root,createHash('sha256').update(key).digest('hex'));
}
function seal(data:Ledger,key:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(key).digest(),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);}
function unseal(data:Buffer,key:string):Ledger{const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(key).digest(),data.subarray(0,12));decipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString());}
async function load(file:string,key:string):Promise<Ledger>{try{return unseal(await readFile(file),key)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {limits:{...defaultLimits},entries:[]};throw new HttpError(503,'Usage history could not be read. Builds are paused to protect your token budget.')}}
async function sharedData(key:string){
 const db=sharedUsageDb();if(!db)return null;
 const previous=await readSharedLedger(db,createHash('sha256').update(key).digest('hex'));
 try{return previous?unseal(Buffer.from(previous.ciphertext,'base64'),key):{limits:{...defaultLimits},entries:[]};}
 catch{throw new HttpError(503,'Shared usage history could not be decrypted. Builds are paused.');}
}
export async function changeLedger<T>(key:string,change:(ledger:Ledger)=>T){
 const db=sharedUsageDb();
 if(db){
  const id=createHash('sha256').update(key).digest('hex');
  for(let attempt=0;attempt<8;attempt++){
   const previous=await readSharedLedger(db,id);
   let data:Ledger;
   try{data=previous?unseal(Buffer.from(previous.ciphertext,'base64'),key):process.env.VERCEL?{limits:{...defaultLimits},entries:[]}:await load(path.join(location(key),'ledger.enc'),key);}
   catch{throw new HttpError(503,'Usage history could not be read. Builds are paused to protect your budget.');}
   const result=change(data);
   if(await writeSharedLedger(db,id,previous,seal(data,key).toString('base64')))return result;
  }
  throw new HttpError(409,'Usage history is busy. Wait a moment before trying again.');
 }

 const dir=location(key);await mkdir(dir,{recursive:true,mode:0o700});const lock=path.join(dir,'lock');
 try{await mkdir(lock)}catch{throw new HttpError(409,'Usage history is busy. Wait a moment before trying again.');}
 try{const file=path.join(dir,'ledger.enc'),data=await load(file,key);const result=change(data);const temp=path.join(dir,'ledger.tmp');await writeFile(temp,seal(data,key),{mode:0o600});await rename(temp,file);return result}finally{await rmdir(lock)}
}
const empty=():TokenUsage=>({input:0,cachedInput:0,output:0,reasoning:0,total:0});
function sum(entries:StoredEntry[]){return entries.reduce((sum,e)=>{if(e.usage)for(const k of Object.keys(sum) as (keyof TokenUsage)[])sum[k]+=e.usage[k];return sum},empty())}
export async function usageSummary(key:string):Promise<UsageSummary>{const data=await sharedData(key)??await load(path.join(location(key),'ledger.enc'),key);const recent=data.entries.filter(e=>Date.parse(e.createdAt)>Date.now()-86400000);return {limits:data.limits,entries:data.entries.map(({result,rawOutput,digest,...entry})=>entry).reverse(),today:sum(recent),allTime:sum(data.entries),reserved:recent.filter(e=>!e.usage).reduce((n,e)=>n+e.reservation,0)}}
export async function beginUsage(key:string,entry:StoredEntry){return changeLedger(key,data=>{
 const previous=data.entries.find(e=>e.id===entry.id);
 if(previous&&previous.digest!==entry.digest)throw new HttpError(409,'This build ID belongs to a different request.');
 const cached=previous??data.entries.find(e=>e.digest===entry.digest&&e.status==='completed');
 if(cached?.status==='completed'&&cached.result){cached.reused++;return {cached:cached.result,limits:data.limits};}
 if(previous)throw new HttpError(409,previous.status==='running'?'This build is already running.':'This attempt already ran. Check Usage before explicitly starting another attempt.');
 if(data.entries.some(e=>e.status==='running'&&Date.parse(e.createdAt)>Date.now()-360000))throw new HttpError(409,'A build is already running for this API key. No extra request was sent.');
 for(const e of data.entries)if(e.status==='running')e.status='uncertain';
 const recent=data.entries.filter(e=>Date.parse(e.createdAt)>Date.now()-86400000);
 const spent=recent.reduce((n,e)=>n+(e.usage?.total??e.reservation),0);
 if(recent.length>=data.limits.dailyBuilds)throw new HttpError(429,'Your rolling 24-hour build limit has been reached.');
 if(spent+entry.reservation>data.limits.dailyTokens)throw new HttpError(429,'This build would exceed your token budget reservation. Reduce the output limit or adjust your budget in Usage.');
 data.entries.push(entry);return {cached:null,limits:data.limits};
 })}
export async function recordUsage(key:string,id:string,patch:Partial<StoredEntry>){return changeLedger(key,data=>{const entry=data.entries.find(e=>e.id===id);if(!entry)throw new HttpError(409,'Build record missing.');Object.assign(entry,patch)})}
