import {NextResponse} from 'next/server';
import {z} from 'zod';
import {credential,requireSameOrigin} from '@/lib/credentials';
import {changeLedger,usageSummary} from '@/lib/usage-store';
import {authorize,failure,HttpError,readBody} from '@/lib/server';
async function keyFor(request:Request){const own=credential(request,'openai');if(own)return own;if(process.env.OPENAI_API_KEY){await authorize(request);return process.env.OPENAI_API_KEY}throw new HttpError(400,'Connect OpenAI in Settings to track usage.');}
export async function GET(request:Request){try{return NextResponse.json(await usageSummary(await keyFor(request)),{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function PATCH(request:Request){try{requireSameOrigin(request);const key=await keyFor(request);const limits=z.object({monthlyUsd:z.number().min(1).max(10000).default(100),maxBuildUsd:z.number().min(0.1).max(100).default(3),dailyTokens:z.number().int().min(1000).max(2000000),maxOutputTokens:z.number().int().min(1000).max(18000),maxInputCharacters:z.number().int().min(1000).max(150000),dailyBuilds:z.number().int().min(1).max(100)}).parse(await readBody(request));await changeLedger(key,data=>{data.limits=limits});return NextResponse.json({saved:true})}catch(e){return failure(e)}}
