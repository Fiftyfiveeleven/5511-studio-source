import {NextResponse} from 'next/server';
import {z} from 'zod';
import {credential,requireSameOrigin} from '@/lib/credentials';
import {failure,readBody,HttpError} from '@/lib/server';
import {artifactSchema,validateConnection} from '@/lib/artifacts';
import {github,pushGithub,repositoryPath} from '@/lib/github';
const repoName=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/).refine(x=>x!=='.'&&x!=='..');
export async function POST(request:Request){try{
 requireSameOrigin(request);const token=credential(request,'github');if(!token)throw new HttpError(401,'Connect your GitHub account in Settings first.');
 const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),name:repoName,private:z.boolean(),projectId:z.uuid()}),
 z.object({action:z.literal('inspect'),repository:z.string().max(200)}),
 z.object({action:z.literal('push'),projectId:z.uuid(),name:z.string().min(1).max(80),repository:z.string().max(200),branch:z.string().min(1).max(200).regex(/^[a-zA-Z0-9_./-]+$/),files:artifactSchema.shape.files,sql:z.string().max(50000),url:z.string().max(200).nullable(),key:z.string().max(2000).nullable()})]).parse(await readBody(request));
 if(input.action==='create'){const repo=await github(token,'/user/repos','POST',{name:input.name,private:input.private,auto_init:true,description:`5511 Studio project ${input.projectId}`});return NextResponse.json({repository:repo.full_name,branch:repo.default_branch,url:repo.html_url})}
 if(input.action==='inspect'){const repo=await github(token,repositoryPath(input.repository));if(!repo.permissions?.push)throw new HttpError(403,'Repository write access is required.');return NextResponse.json({repository:repo.full_name,branch:repo.default_branch,url:repo.html_url})}
 let connection;try{connection=validateConnection(input.url??'',input.key??'')}catch(e){throw new HttpError(400,(e as Error).message)}
 return NextResponse.json(await pushGithub(token,{...input,...connection}));
 }catch(e){return failure(e)}}
