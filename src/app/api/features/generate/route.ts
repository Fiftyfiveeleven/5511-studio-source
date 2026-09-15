import {z} from 'zod';
import {authorize,failure,readBody,HttpError} from '@/lib/server';
import {requireSameOrigin,credential} from '@/lib/credentials';
import {generateApp} from '@/lib/generate';
import {artifactSchema} from '@/lib/artifacts';
import {isFullstack} from '@/lib/fullstack-project';
import {aiFeaturePath} from '@/lib/ai-feature';
export const maxDuration=300;
const schema=z.object({requestId:z.uuid(),prompt:z.string().trim().min(3).max(6000),name:z.string().trim().min(1).max(80),files:z.array(artifactSchema.shape.files.element).max(30),previousTurn:z.object({prompt:z.string().max(6000),summary:z.string().max(4000)}).optional()});
export async function POST(request:Request){try{requireSameOrigin(request);const {user}=await authorize(request);const input=schema.parse(await readBody(request,650000));if(isFullstack(input.files))throw new HttpError(400,'Feature Studio requires a self-contained browser feature.');const key=credential(request,'openai')||process.env.OPENAI_API_KEY;if(!key)throw new HttpError(400,'Connect OpenAI in Settings first.');const result=await generateApp(key,input.prompt,input.name,input.files.filter(f=>f.path!==aiFeaturePath),false,{reusableFeature:true,requestId:input.requestId,projectId:user.id,previousTurn:input.previousTurn});return Response.json(result,{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e)}}
