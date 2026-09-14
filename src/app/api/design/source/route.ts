import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSameOrigin} from '@/lib/credentials';
import {failure,readBody,HttpError} from '@/lib/server';
import {artifactSchema,validateArtifact} from '@/lib/artifacts';
import {designChangeSchema} from '@/lib/design-types';
import {designElements,applyJsxDesignChange} from '@/lib/design-source';
export async function POST(request:Request){try{requireSameOrigin(request);const input=z.object({files:artifactSchema.shape.files,change:designChangeSchema.optional()}).parse(await readBody(request));validateArtifact({name:'Design',summary:'Inspect',files:input.files,sql:''});const files=input.change?applyJsxDesignChange(input.files,input.change):input.files;validateArtifact({name:'Design',summary:'Edit',files,sql:''});return NextResponse.json({files,elements:designElements(files)});}catch(e){return failure(e instanceof Error&&!(e instanceof HttpError)?new HttpError(400,e.message.slice(0,500)):e)}}
