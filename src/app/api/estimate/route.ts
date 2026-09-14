import {z} from 'zod';
import {NextResponse} from 'next/server';
import {credential,requireSameOrigin} from '@/lib/credentials';
import {authorize,failure,readBody,HttpError} from '@/lib/server';
import {estimateGeneration} from '@/lib/generate';
import {artifactSchema} from '@/lib/artifacts';
import {specificationSchema} from '@/lib/project-memory';
import {attachmentsSchema} from '@/lib/attachments';
import {usageSummary} from '@/lib/usage-store';
export async function POST(request:Request){try{requireSameOrigin(request);let key=credential(request,'openai');if(!key&&process.env.OPENAI_API_KEY){await authorize(request);key=process.env.OPENAI_API_KEY;}if(!key)throw new HttpError(400,'Connect OpenAI in Settings first.');const input=z.object({prompt:z.string().min(5).max(6000),name:z.string().max(80),files:z.array(artifactSchema.shape.files.element).max(80),connected:z.boolean(),previousSql:z.string().max(50000).default(''),images:attachmentsSchema,specification:specificationSchema.optional()}).parse(await readBody(request,2000000));const result=await estimateGeneration(key,input.prompt,input.name,input.files,input.connected,input);const usage=await usageSummary(key);return NextResponse.json({model:result.model,route:result.route.info,reservedUsd:result.reservedUsd,reservedTokens:result.reservation,maxBuildUsd:usage.limits.maxBuildUsd??3,remainingMonthUsd:Math.max(0,(usage.limits.monthlyUsd??100)-(usage.monthUsd??0)-(usage.monthReservedUsd??0))},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
