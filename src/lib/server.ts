import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export async function authorize(request:Request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new HttpError(503,'Connect the Studio Supabase project to enable your workspace.');
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!token)throw new HttpError(401,'Sign in to continue.');
 const db=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user)throw new HttpError(401,'Your session expired. Please sign in again.');
 const allowed=process.env.STUDIO_ALLOWED_EMAILS?.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(allowed?.length&&!allowed.includes(data.user.email?.toLowerCase()??''))throw new HttpError(403,'This workspace is invite-only.');
 return {db,user:data.user};
}
export async function readBody(request:Request,maxLength=600000){const text=await request.text();if(text.length>maxLength)throw new HttpError(413,'Request is too large.');try{return JSON.parse(text)}catch{throw new HttpError(400,'Invalid request.')}}
export function failure(error:unknown){if(error instanceof HttpError)return NextResponse.json({error:error.message},{status:error.status});if(error instanceof Error&&error.name==='ZodError')return NextResponse.json({error:'Please check your input.'},{status:400});console.error('Studio request failed',error instanceof Error?error.name:'Unknown error');return NextResponse.json({error:'The request could not be completed. Please try again.'},{status:500});}
export async function ownedProject(db:Awaited<ReturnType<typeof authorize>>['db'],id:string){const {data,error}=await db.from('projects').select('*').eq('id',id).single();if(error||!data)throw new HttpError(404,'Project not found.');return data;}
