import {NextResponse} from 'next/server';
import {credential,requireSameOrigin} from '@/lib/credentials';
import {failure,readBody,HttpError} from '@/lib/server';
import {reviewDesign,reviewInputSchema} from '@/lib/design-review';
export const maxDuration=180;
export async function POST(request:Request){try{requireSameOrigin(request);const key=credential(request,'openai');if(!key)throw new HttpError(401,'Connect your OpenAI key in Settings.');const input=reviewInputSchema.parse(await readBody(request,2000000));return NextResponse.json(await reviewDesign(key,input));}catch(e){return failure(e)}}
