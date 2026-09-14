import {specificationSchema} from '@/lib/project-memory';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {authorize,readBody,failure,HttpError} from '@/lib/server';
import {requireSameOrigin} from '@/lib/credentials';
import {artifactSchema,validateArtifact,validateConnection} from '@/lib/artifacts';
import {backupRevision} from '@/lib/project-storage';
export async function POST(request:Request){try{requireSameOrigin(request);const {db,user}=await authorize(request);const input=z.object({specification:specificationSchema.optional(),id:z.uuid(),name:z.string().min(1).max(80),description:z.string().max(6000),url:z.string().nullable(),key:z.string().nullable(),revision:z.object({files:artifactSchema.shape.files,sql:z.string().max(50000),tokens:z.number().int().min(0).max(10000000)}).nullable()}).parse(await readBody(request));
 const {data:existing}=await db.from('projects').select('*').eq('id',input.id).maybeSingle();if(existing){if(existing.owner_id!==user.id)throw new HttpError(409,'This project belongs to a different cloud account.');if(existing.current_revision_id||!input.revision)return NextResponse.json({project:existing,existing:true});}
 const connection=validateConnection(input.url??'',input.key??'');
 let project=existing;if(!project){const created=await db.from('projects').insert({id:input.id,owner_id:user.id,specification:input.specification??{},name:input.name,description:input.description,supabase_url:connection.url,supabase_key:connection.key}).select().single();if(created.error)throw new HttpError(409,'This project could not be copied. It may already exist in another account.');project=created.data;}
 let storage;if(input.revision){const artifact=validateArtifact({name:input.name,summary:'Imported from this browser',...input.revision});const {data:revision,error}=await db.rpc('save_project_revision',{p_project:input.id,p_expected:null,p_prompt:'Copied current version from browser workspace',p_files:artifact.files,p_sql:artifact.sql,p_tokens:input.revision.tokens});if(error)throw new HttpError(503,'Cloud copy needs the team database migration. Your browser project is unchanged.');project.current_revision_id=revision.id;storage=await backupRevision(db,project,revision);}
 return NextResponse.json({project,storage,existing:false});}catch(e){return failure(e)}}
