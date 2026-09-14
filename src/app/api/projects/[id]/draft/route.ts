import {NextResponse} from 'next/server';
import {z} from 'zod';
import {authorize,readBody,failure,HttpError} from '@/lib/server';
import {requireSameOrigin} from '@/lib/credentials';
import {requireEditor} from '@/lib/project-access';
import {attachmentsSchema} from '@/lib/attachments';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){try{const {db,user}=await authorize(request);const {id}=await ctx.params;await requireEditor(db,id,user.id);const {data,error}=await db.from('project_drafts').select('prompt,images').eq('project_id',id).eq('user_id',user.id).maybeSingle();if(error)throw new HttpError(503,'Cloud drafts need the team database migration.');return NextResponse.json(data??{prompt:'',images:[]},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function PUT(request:Request,ctx:{params:Promise<{id:string}>}){try{requireSameOrigin(request);const {db,user}=await authorize(request);const {id}=await ctx.params;await requireEditor(db,id,user.id);const input=z.object({prompt:z.string().max(6000),images:attachmentsSchema}).parse(await readBody(request,2000000));const {error}=await db.from('project_drafts').upsert({project_id:id,user_id:user.id,...input,updated_at:new Date().toISOString()});if(error)throw new HttpError(503,'Could not save the cloud draft. Your local draft is still available.');return NextResponse.json({saved:true})}catch(e){return failure(e)}}
