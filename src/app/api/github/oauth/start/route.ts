import {NextResponse} from 'next/server';
import {randomBytes,createHash} from 'node:crypto';
import {requireSameOrigin,credentialTransport,secureRequest} from '@/lib/credentials';
import {failure,HttpError} from '@/lib/server';
export async function POST(request:Request){try{
 requireSameOrigin(request);credentialTransport(request);const client=process.env.GITHUB_CLIENT_ID,redirect=process.env.GITHUB_REDIRECT_URI;
 if(!client||!redirect||!process.env.GITHUB_CLIENT_SECRET)throw new HttpError(400,'Set up the GitHub OAuth app first, or connect a token in Settings.');
 if(new URL(redirect).origin!==request.headers.get('origin'))throw new HttpError(400,'Open Studio at the same address as its configured GitHub callback.');
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 const url=new URL('https://github.com/login/oauth/authorize');url.search=new URLSearchParams({client_id:client,redirect_uri:redirect,scope:'repo',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).toString();
 const response=NextResponse.json({url:url.toString()},{headers:{'Cache-Control':'no-store'}});for(const [key,value]of Object.entries({studio_github_state:state,studio_github_verifier:verifier}))response.cookies.set(key,value,{httpOnly:true,secure:secureRequest(request),sameSite:'lax',path:'/api/github/oauth',maxAge:600});return response;
 }catch(e){return failure(e)}}
