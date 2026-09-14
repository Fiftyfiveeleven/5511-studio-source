import {NextResponse} from 'next/server';
import {workspaceStatus} from '@/lib/workspace-status';
export const dynamic='force-dynamic';
export async function GET(request:Request){return NextResponse.json(await workspaceStatus(request.headers.get('authorization')?.replace(/^Bearer /,'')),{headers:{'Cache-Control':'no-store'}})}
