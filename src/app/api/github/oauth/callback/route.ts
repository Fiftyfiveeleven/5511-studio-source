import {NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {cookieName,secureRequest} from '@/lib/credentials';
import {github} from '@/lib/github';
function cookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)??''}
export async function GET(request:Request){
 const redirect=process.env.GITHUB_REDIRECT_URI;if(!redirect)return NextResponse.json({error:'GitHub OAuth is not configured.'},{status:400});
 const destination=new URL('/settings',redirect);const finish=(error?:string,token?:string,expires?:number)=>{if(error)destination.searchParams.set('github_error',error);else destination.searchParams.set('github_connected','1');const response=NextResponse.redirect(destination);for(const key of ['studio_github_state','studio_github_verifier'])response.cookies.set(key,'',{httpOnly:true,secure:secureRequest(request),sameSite:'lax',path:'/api/github/oauth',maxAge:0});if(token)response.cookies.set(cookieName('github'),token,{httpOnly:true,secure:secureRequest(request),sameSite:'strict',path:'/api',maxAge:Math.min(expires??2592000,2592000)});return response};
 try{const query=new URL(request.url).searchParams,expected=cookie(request,'studio_github_state'),state=query.get('state')??'',code=query.get('code'),verifier=cookie(request,'studio_github_verifier');if(!expected||!state||!code||!verifier||state.length!==expected.length||!timingSafeEqual(Buffer.from(state),Buffer.from(expected)))return finish('Sign-in expired or was canceled. Try again.');
 const r=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,client_secret:process.env.GITHUB_CLIENT_SECRET,redirect_uri:redirect,code,state,code_verifier:verifier}),signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok||typeof data.access_token!=='string')return finish('GitHub did not complete sign-in. Try again.');await github(data.access_token,'/user');return finish(undefined,data.access_token,data.expires_in);
 }catch{return finish('Could not connect to GitHub. Try again.');}
}
