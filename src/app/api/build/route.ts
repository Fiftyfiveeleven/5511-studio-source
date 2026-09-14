import {isFullstack} from '@/lib/fullstack-project';
import {specificationSchema} from '@/lib/project-memory';
import {artifactSchema} from '@/lib/artifacts';
import {attachmentsSchema} from '@/lib/attachments';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {credential,requireSameOrigin} from '@/lib/credentials';
import {generateApp} from '@/lib/generate';
import {failure,readBody,HttpError} from '@/lib/server';
export const maxDuration=300;
export async function POST(request:Request){try{
 requireSameOrigin(request);
 // Guest requests must bring their own key; never use the workspace's paid key.
 const key=credential(request,'openai');if(!key)throw new HttpError(400,'Add your OpenAI key in Settings to start building.');
 const input=z.object({specification:specificationSchema.optional(),buildId:z.uuid().optional(),budgetUsd:z.number().min(0.1).max(100).optional(),images:attachmentsSchema,prompt:z.string().trim().min(5).max(6000),name:z.string().max(80),files:z.array(artifactSchema.shape.files.element).max(80),connected:z.boolean(),requestId:z.uuid(),projectId:z.uuid(),previousSql:z.string().max(50000).default('')}).parse(await readBody(request,2000000));
 if(isFullstack(input.files))throw new HttpError(400,'Use a signed-in background build for Next.js projects.');
 return NextResponse.json(await generateApp(key,input.prompt,input.name,input.files,input.connected,{requestId:input.requestId,projectId:input.projectId,previousSql:input.previousSql,images:input.images,specification:input.specification,buildId:input.buildId,budgetUsd:input.budgetUsd}));
 }catch(e){return failure(e)}}
