import {sharedUsageDb} from '@/lib/shared-usage';
import {runtimeReady} from '@/lib/runtime-sandbox';
export const dynamic='force-dynamic';
export async function GET(){const db=sharedUsageDb();const checks={cloudStorage:!!db,jobEncryption:/^[a-f0-9]{64}$/i.test(process.env.STUDIO_JOB_ENCRYPTION_KEY??''),sandbox:runtimeReady(),jobTables:false};if(db){try{const {error}=await db.from('studio_build_jobs').select('id').limit(0);checks.jobTables=!error;}catch{}}return Response.json({ready:Object.values(checks).every(Boolean),checks},{headers:{'Cache-Control':'no-store'}});}
