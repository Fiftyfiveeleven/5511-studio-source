import {createClient} from '@supabase/supabase-js';
import {HttpError} from './server';
export function sharedUsageDb(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
}
export type SharedLedger={version:number;ciphertext:string};
export async function readSharedLedger(db:NonNullable<ReturnType<typeof sharedUsageDb>>,id:string):Promise<SharedLedger|null>{
 const {data,error}=await db.from('studio_usage_ledgers').select('version,ciphertext').eq('id',id).maybeSingle();
 if(error)throw new HttpError(503,'Shared usage history is unavailable. Check the Studio Supabase server key and database migration.');
 return data;
}
export async function writeSharedLedger(db:NonNullable<ReturnType<typeof sharedUsageDb>>,id:string,previous:SharedLedger|null,ciphertext:string){
 if(!previous){const {error}=await db.from('studio_usage_ledgers').insert({id,version:1,ciphertext});if(error?.code==='23505')return false;if(error)throw new HttpError(503,'Shared usage history could not be saved. No new build was started.');return true;}
 const {data,error}=await db.from('studio_usage_ledgers').update({ciphertext,version:previous.version+1,updated_at:new Date().toISOString()}).eq('id',id).eq('version',previous.version).select('id');
 if(error)throw new HttpError(503,'Shared usage history could not be saved. Builds are paused to protect your budget.');
 return !!data?.length;
}
