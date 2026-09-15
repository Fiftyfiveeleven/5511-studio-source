import {authorize,failure,readBody,HttpError} from '@/lib/server';
import {credential,requireSameOrigin} from '@/lib/credentials';
import {editImage,imageEditSchema} from '@/lib/image-edit';
export const maxDuration=240;
export async function POST(request:Request){try{requireSameOrigin(request);await authorize(request);const key=credential(request,'openai')||process.env.OPENAI_API_KEY;if(!key)throw new HttpError(400,'Connect OpenAI in Settings first.');const input=imageEditSchema.parse(await readBody(request,500000));return Response.json(await editImage(key,input),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e)}}
