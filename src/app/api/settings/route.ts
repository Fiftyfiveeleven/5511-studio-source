import {NextResponse} from 'next/server';
import {z} from 'zod';
import {credential,cookieName,requireSameOrigin,secureRequest,credentialTransport} from '@/lib/credentials';
import {failure,readBody,HttpError} from '@/lib/server';
export function GET(request:Request){return NextResponse.json({generation:!!credential(request,'openai'),deployment:!!credential(request,'vercel'),team:credential(request,'team')},{headers:{'Cache-Control':'no-store'}})}
export async function POST(request:Request){try{
 requireSameOrigin(request);credentialTransport(request);
 const input=z.object({provider:z.enum(['openai','vercel']),key:z.string().trim().min(10).max(512),team:z.string().trim().max(120).regex(/^[a-zA-Z0-9_-]*$/).optional()}).parse(await readBody(request));
 const url=input.provider==='openai'?'https://api.openai.com/v1/models':`https://api.vercel.com/v9/projects?limit=1${input.team?'&teamId='+encodeURIComponent(input.team):''}`;
 const response=await fetch(url,{headers:{Authorization:`Bearer ${input.key}`},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new HttpError(400,response.status===401||response.status===403?'This key was not accepted. Check its permissions and try again.':'The provider is unavailable or rate-limited. Please try again shortly.');
 const result=NextResponse.json({saved:true},{headers:{'Cache-Control':'no-store'}});
 const options={httpOnly:true,secure:secureRequest(request),sameSite:'strict' as const,path:'/api',maxAge:60*60*24*30};
 result.cookies.set(cookieName(input.provider),input.key,options);
 if(input.provider==='vercel')result.cookies.set(cookieName('team'),input.team??'',options);
 return result;
 }catch(e){return failure(e)}}
export async function DELETE(request:Request){try{requireSameOrigin(request);const {provider}=z.object({provider:z.enum(['openai','vercel'])}).parse(await readBody(request));const response=NextResponse.json({removed:true});for(const p of provider==='vercel'?['vercel','team'] as const:['openai'] as const)response.cookies.set(cookieName(p),'',{httpOnly:true,secure:secureRequest(request),sameSite:'strict',path:'/api',maxAge:0});return response}catch(e){return failure(e)}}
