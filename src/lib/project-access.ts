import {HttpError,ownedProject,type authorize} from './server';
type Db=Awaited<ReturnType<typeof authorize>>['db'];
export async function projectRole(db:Db,id:string,userId:string){const project=await ownedProject(db,id);if(project.owner_id===userId)return 'owner' as const;const {data,error}=await db.rpc('project_role',{p_project:id});if(error)throw new HttpError(503,'Team access is not activated on the Studio database yet.');if(!data)throw new HttpError(404,'Project not found.');return data as 'owner'|'editor'|'viewer'}
export async function requireEditor(db:Db,id:string,userId:string){const role=await projectRole(db,id,userId);if(!['owner','editor'].includes(role))throw new HttpError(403,'This project is view-only for your account.');return role}
