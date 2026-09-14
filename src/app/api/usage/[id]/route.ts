import {NextResponse} from 'next/server';
import {credential} from '@/lib/credentials';
import {changeLedger} from '@/lib/usage-store';
import {failure,HttpError} from '@/lib/server';
import {z} from 'zod';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){try{const key=credential(request,'openai');if(!key)throw new HttpError(401,'Connect the same OpenAI key to recover this build.');const id=z.uuid().parse((await ctx.params).id);const result=await changeLedger(key,data=>{const row=data.entries.find(e=>e.id===id);if(!row)throw new HttpError(404,'Build not found.');return {status:row.status,result:row.result??null,projectId:row.projectId}});return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
