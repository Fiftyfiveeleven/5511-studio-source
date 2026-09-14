import {NextRequest,NextResponse} from 'next/server';
import {requireSameOrigin} from './lib/credentials';
import {authorize,HttpError} from './lib/server';
export async function proxy(request:NextRequest){
 try{await authorize(request);if(!['GET','HEAD','OPTIONS'].includes(request.method))requireSameOrigin(request);const response=NextResponse.next();response.headers.set('Cache-Control','private, no-store');return response;}
 catch(e){const status=e instanceof HttpError?e.status:503;
  if(request.nextUrl.pathname.startsWith('/api/'))return NextResponse.json({error:status===503?'Studio sign-in is not configured or is unavailable.':'Sign in with an authorized Supabase account to continue.'},{status,headers:{'Cache-Control':'no-store'}});
  const response=NextResponse.redirect(new URL('/login',request.url));response.headers.set('Cache-Control','no-store');return response;
 }
}
// Workflow endpoints authenticate their own runtime deliveries. Static assets and login remain public.
export const config={matcher:['/','/settings/:path*','/usage/:path*','/api/((?!auth/session(?:/|$)).*)']};
