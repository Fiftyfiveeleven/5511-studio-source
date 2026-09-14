import {NextResponse} from 'next/server';
import {validateConnection} from '@/lib/artifacts';
import {requireSameOrigin} from '@/lib/credentials';
import {failure,readBody,HttpError} from '@/lib/server';
import {z} from 'zod';
export async function POST(request:Request){try{requireSameOrigin(request);const {url,key}=z.object({url:z.string().max(200),key:z.string().max(2000)}).parse(await readBody(request));try{return NextResponse.json(validateConnection(url,key))}catch(e){throw new HttpError(400,(e as Error).message)}}catch(e){return failure(e)}}
