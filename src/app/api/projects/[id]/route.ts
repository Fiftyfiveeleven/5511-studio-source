import {projectRole} from '@/lib/project-access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize,failure,readBody,ownedProject,HttpError } from '@/lib/server';
import { validateConnection } from '@/lib/artifacts';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,ctx:Context){try{const {db,user}=await authorize(request);const {id}=await ctx.params;const project=await ownedProject(db,id);const {data:revisions,error}=await db.from('revisions').select('*').eq('project_id',id).order('created_at',{ascending:false});if(error)throw error;return NextResponse.json({project:{...project,access_role:await projectRole(db,id,user.id)},revisions})}catch(e){return failure(e)}}
export async function PATCH(request:Request,ctx:Context){try{const {db}=await authorize(request);const {id}=await ctx.params;await ownedProject(db,id);const input=z.object({name:z.string().trim().min(1).max(80).optional(),supabase_url:z.string().max(200).optional(),supabase_key:z.string().max(2000).optional(),current_revision_id:z.uuid().optional()}).parse(await readBody(request));
 if(input.supabase_url!==undefined||input.supabase_key!==undefined){try{const c=validateConnection(input.supabase_url??'',input.supabase_key??'');Object.assign(input,{supabase_url:c.url,supabase_key:c.key})}catch(e){throw new HttpError(400,(e as Error).message)}}
 if(input.current_revision_id){const {data}=await db.from('revisions').select('id').eq('project_id',id).eq('id',input.current_revision_id).single();if(!data)throw new HttpError(400,'Version does not belong to this project.');}
 const {data,error}=await db.from('projects').update({...input,updated_at:new Date().toISOString()}).eq('id',id).select().single();if(error)throw error;return NextResponse.json(data)}catch(e){return failure(e)}}
