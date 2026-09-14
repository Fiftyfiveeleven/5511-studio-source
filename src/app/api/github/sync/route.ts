import {NextResponse} from 'next/server';
import {z} from 'zod';
import {credential,requireSameOrigin} from '@/lib/credentials';
import {failure,readBody,HttpError} from '@/lib/server';
import {githubConnectionSchema} from '@/lib/github-connection';
import {artifactSchema} from '@/lib/artifacts';
import {readGithubSource} from '@/lib/github-sync';
import {mergeSources} from '@/lib/github-merge';
export const maxDuration=180;
export async function POST(request:Request){try{requireSameOrigin(request);const token=credential(request,'github');if(!token)throw new HttpError(401,'Connect GitHub in Settings.');const input=z.object({connection:githubConnectionSchema,projectId:z.uuid(),files:artifactSchema.shape.files,sql:z.string().max(50000)}).parse(await readBody(request));const {repository,branch,head}=input.connection;
 const cache=new Map<string,Promise<string>>();const [remote,base]=await Promise.all([readGithubSource(token,repository,branch,input.projectId,undefined,cache),head?readGithubSource(token,repository,branch,input.projectId,head,cache):Promise.resolve({files:[]})]);
 const local=[...input.files,{path:'schema.sql',content:input.sql}];const merge=mergeSources(base.files,local,remote.files);
 return NextResponse.json({...merge,base:base.files,remote:remote.files,head:remote.head});}catch(e){return failure(e)}}
