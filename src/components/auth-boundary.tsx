'use client';
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {browserDb} from '@/lib/supabase';
export default function AuthBoundary({children}:{children:React.ReactNode}){
 const pathname=usePathname(),[ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(pathname==='/login')return;let active=true;let queue=Promise.resolve();const db=browserDb();
 const sync=(token?:string)=>{queue=queue.then(async()=>{if(!active)return;setError('');if(!token){setReady(false);await fetch('/api/auth/session',{method:'DELETE'});if(active)window.location.replace('/login');return}const r=await fetch('/api/auth/session',{method:'POST',headers:{Authorization:'Bearer '+token}});if(!active)return;if(!r.ok){setReady(false);setError('Your session could not be verified. Please sign in again.');return}setReady(true)}).catch(()=>{if(active){setReady(false);setError('Could not verify your session. Check your connection and reload.')}})};
 if(!db){setError('Studio Supabase sign-in is not configured.');return}
 const {data}=db.auth.onAuthStateChange((_event,session)=>{sync(session?.access_token)});
 return()=>{active=false;data.subscription.unsubscribe()};
 },[pathname]);
 if(pathname==='/login')return children;
 if(!ready)return <main className="login-screen"><div className="login-card"><h1>{error?'Sign-in required':'Opening your workspace…'}</h1>{error&&<><p role="alert">{error}</p><a href="/login">Go to sign in</a></>}</div></main>;
 return <><div className="auth-account"><span>Supabase workspace</span><button onClick={async()=>{setReady(false);const r=await fetch('/api/auth/session',{method:'DELETE'});if(!r.ok){setError('Sign-out failed. Please retry.');return}await browserDb()?.auth.signOut({scope:'local'});window.location.replace('/login')}}>Sign out</button></div>{children}</>;
}
