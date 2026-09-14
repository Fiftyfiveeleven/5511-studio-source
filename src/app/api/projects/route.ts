import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize,failure,readBody } from '@/lib/server';
export async function GET(request:Request){try{const {db}=await authorize(request);const {data,error}=await db.from('projects').select('*').order('updated_at',{ascending:false});if(error)throw error;return NextResponse.json(data)}catch(e){return failure(e)}}
export async function POST(request:Request){try{const {db,user}=await authorize(request);const input=z.object({name:z.string().trim().min(1).max(80),description:z.string().max(6000).default('')}).parse(await readBody(request));const {data,error}=await db.from('projects').insert({...input,owner_id:user.id}).select().single();if(error)throw error;return NextResponse.json(data,{status:201})}catch(e){return failure(e)}}
