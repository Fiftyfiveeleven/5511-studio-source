import {requireEditor} from '@/lib/project-access';
import {backupRevision} from '@/lib/project-storage';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireSameOrigin} from '@/lib/credentials';
import {authorize,ownedProject,readBody,failure,HttpError} from '@/lib/server';
import {artifactSchema,validateArtifact} from '@/lib/artifacts';
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){try{
 requireSameOrigin(request);const {db,user}=await authorize(request);const {id}=await ctx.params;const project=await ownedProject(db,id);await requireEditor(db,id,user.id);
 const input=z.object({expectedRevision:z.uuid(),files:artifactSchema.shape.files}).parse(await readBody(request));
 if(project.current_revision_id!==input.expectedRevision)throw new HttpError(409,'This project changed. Reopen it before saving edits.');
 const {data:previous,error:readError}=await db.from('revisions').select('sql').eq('project_id',id).eq('id',input.expectedRevision).single();if(readError||!previous)throw new HttpError(404,'Version not found.');
 const artifact=validateArtifact({name:project.name,summary:'Text edited directly in the preview. No AI tokens used.',files:input.files,sql:previous.sql});
 const {data:revision,error}=await db.rpc('save_project_revision',{p_project:id,p_expected:input.expectedRevision,p_prompt:'Direct text edit',p_files:artifact.files,p_sql:artifact.sql,p_tokens:0});if(error)throw new HttpError(409,'Could not save this version. Reopen the project; the team database migration must be active.');
 return NextResponse.json({...revision,storage:await backupRevision(db,project,revision)});
 }catch(e){return failure(e)}}
