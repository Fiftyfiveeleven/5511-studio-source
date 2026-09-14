import {NextResponse} from 'next/server';
import {authorize,failure,HttpError} from '@/lib/server';
import {authCookie} from '@/lib/auth-session';
import {requireSameOrigin,secureRequest,credentialTransport} from '@/lib/credentials';
const providerCookies=['studio_openai','studio_github','studio_vercel','studio_team'];
function clearProviders(response:NextResponse,secure:boolean){for(const name of providerCookies)response.cookies.set(name,'',{path:'/api',httpOnly:true,secure,sameSite:'strict',maxAge:0});for(const name of ['studio_github_state','studio_github_verifier'])response.cookies.set(name,'',{path:'/api/github/oauth',httpOnly:true,secure,sameSite:'lax',maxAge:0})}
export async function POST(request:Request){try{
 requireSameOrigin(request);credentialTransport(request);
 const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1];if(!token)throw new HttpError(401,'Sign in to continue.');
 const {user}=await authorize(request);const secure=secureRequest(request);const response=NextResponse.json({user:{id:user.id,email:user.email}},{headers:{'Cache-Control':'no-store'}});
 const owner=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('studio_auth_owner='))?.slice('studio_auth_owner='.length);
 if(owner!==user.id)clearProviders(response,secure);
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());const seconds=Math.max(0,Math.min(3600,Number(claims.exp)-Math.floor(Date.now()/1000)));if(!Number.isFinite(seconds)||seconds<1)throw new HttpError(401,'Session expired. Sign in again.');
 response.cookies.set(authCookie,token,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:seconds});
 response.cookies.set('studio_auth_owner',user.id,{httpOnly:true,secure,sameSite:'strict',path:'/api',maxAge:2592000});return response;
 }catch(e){return failure(e)}}
export async function DELETE(request:Request){try{requireSameOrigin(request);const secure=secureRequest(request);const response=NextResponse.json({signedOut:true},{headers:{'Cache-Control':'no-store'}});response.cookies.set(authCookie,'',{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:0});response.cookies.set('studio_auth_owner','',{httpOnly:true,secure,sameSite:'strict',path:'/api',maxAge:0});clearProviders(response,secure);return response}catch(e){return failure(e)}}
