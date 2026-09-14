import {NextResponse} from 'next/server';
import {z} from 'zod';
import {credential,cookieName,requireSameOrigin,secureRequest,credentialTransport} from '@/lib/credentials';
import {failure,readBody} from '@/lib/server';
import {github} from '@/lib/github';
export async function GET(request:Request){try{const token=credential(request,'github');const user=token?await github(token,'/user'):null;return NextResponse.json({connected:!!user,login:user?.login??'',oauth:!!(process.env.GITHUB_CLIENT_ID&&process.env.GITHUB_CLIENT_SECRET&&process.env.GITHUB_REDIRECT_URI)},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(request:Request){try{requireSameOrigin(request);credentialTransport(request);const {token}=z.object({token:z.string().trim().min(10).max(512)}).parse(await readBody(request));const user=await github(token,'/user');const response=NextResponse.json({connected:true,login:user.login},{headers:{'Cache-Control':'no-store'}});response.cookies.set(cookieName('github'),token,{httpOnly:true,secure:secureRequest(request),sameSite:'strict',path:'/api',maxAge:2592000});return response}catch(e){return failure(e)}}
export async function DELETE(request:Request){try{requireSameOrigin(request);const response=NextResponse.json({removed:true});response.cookies.set(cookieName('github'),'',{httpOnly:true,secure:secureRequest(request),sameSite:'strict',path:'/api',maxAge:0});return response}catch(e){return failure(e)}}
