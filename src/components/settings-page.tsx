'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import RuntimeSettings from './runtime-settings';
import CloudWorkspaceSettings from './cloud-workspace-settings';
import WorkspaceConnectionStatus from './workspace-status';
import GithubSettings from './github-settings';
import {browserDb} from '@/lib/supabase';
import {ArrowLeft,Sparkles,Database,Triangle,Check,LoaderCircle} from 'lucide-react';
export default function SettingsPage(){
 const [signedIn,setSignedIn]=useState(false);
 useEffect(()=>{browserDb()?.auth.getSession().then(({data})=>setSignedIn(!!data.session))},[]);
 const [status,setStatus]=useState({generation:false,deployment:false,team:''}),[openai,setOpenai]=useState(''),[vercel,setVercel]=useState(''),[team,setTeam]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function refresh(){const r=await fetch('/api/settings',{cache:'no-store'});if(!r.ok)throw new Error('Unable to load settings.');const s=await r.json();setStatus(s);setTeam(s.team)}
 useEffect(()=>{refresh().catch(e=>setError(e.message))},[]);
 async function save(provider:'openai'|'vercel',remove=false){setBusy(provider);setError('');setNotice('');try{const r=await fetch('/api/settings',{method:remove?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,...(!remove?{key:provider==='openai'?openai:vercel,...(provider==='vercel'?{team}:{})}:{})})});const result=await r.json();if(!r.ok)throw new Error(result.error);provider==='openai'?setOpenai(''):setVercel('');await refresh();setNotice(remove?'Connection removed.':provider==='openai'?'OpenAI is connected. You can start building now.':'Vercel is connected. Publish whenever you are ready.')}catch(e){setError((e as Error).message)}finally{setBusy('')}}
 return <main className="settings-page"><Link href="/" className="subtle-button"><ArrowLeft size={16}/>Back to Studio</Link><header><p className="eyebrow">5511 STUDIO</p><h1>Settings</h1><p>Connect your AI. Add a database and hosting when you need them.</p></header>
 <section className="settings-card"><div className="settings-card-title"><span className="modal-icon"><Sparkles size={25}/></span><div><h2>OpenAI</h2><p>The brain of your studio</p></div><span className={status.generation?'connection-ready':'connection-needed'}>{status.generation?'Connected':'Required to build'}</span></div><p>Your key powers app creation and chat refinements. Hosted builds also need Studio’s token tracking connection below.</p><form onSubmit={e=>{e.preventDefault();save('openai')}}><label htmlFor="openai-key">{status.generation?'Replace OpenAI API key':'OpenAI API key'}</label><input id="openai-key" type="password" autoComplete="off" spellCheck={false} placeholder={status.generation?'Key saved — enter a new key to replace it':'sk-…'} value={openai} onChange={e=>setOpenai(e.target.value)} required minLength={10}/><div className="settings-actions"><button className="primary-button" disabled={!!busy||!openai.trim()}>{busy==='openai'?<LoaderCircle className="spin" size={15}/>:<Check size={15}/>}Save OpenAI key</button>{status.generation&&<button type="button" className="subtle-button" disabled={!!busy} onClick={()=>save('openai',true)}>Remove key</button>}<a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Get an API key ↗</a></div></form><p className="settings-help">Keys are kept in protected, HTTP-only cookies for this browser for 30 days. They are never returned to the interface or included in app source. OpenAI usage is billed to your API account.</p></section>
 <section className="settings-card"><h2>Token budget</h2><p>Track each build, set input and output limits, and review failed attempts before retrying.</p><Link className="subtle-button" href="/usage">Open token usage &amp; limits →</Link></section>
 <WorkspaceConnectionStatus/>
 <CloudWorkspaceSettings/>
 <RuntimeSettings/>
 <div className="optional-heading"><h2>App integrations</h2><p>Add these to the apps you build when you need them.</p></div>
 <section className="settings-card"><div className="settings-card-title"><Database size={27}/><div><h2>Generated app database</h2><p>Optional · Supabase for each app</p></div></div><p>Connect Supabase from an app’s Database tab when you need accounts or shared data. Each app can use a different project.</p><p className="settings-help">Without a cloud workspace account, Studio saves projects and versions in this browser. They remain here after refresh; export your code to keep a backup or move devices.</p></section>
 <GithubSettings/>
 <section className="settings-card"><div className="settings-card-title"><Triangle size={27}/><div><h2>Vercel</h2><p>Deploy from GitHub</p></div></div><p>Publish each project to its own GitHub repository, then import that repository into Vercel. Future commits trigger deployments there. Studio does not need your Vercel token.</p><a className="subtle-button" href="https://vercel.com/new" target="_blank" rel="noreferrer">Import a GitHub repository in Vercel ↗</a>{status.deployment&&<button className="subtle-button" disabled={!!busy} onClick={()=>save('vercel',true)}>Remove old Vercel token</button>}</section>

 {signedIn&&<section className="settings-card"><h2>Cloud workspace</h2><p>You are signed in. Sign out to use projects saved in this browser.</p><button className="subtle-button" onClick={async()=>{await browserDb()?.auth.signOut();setSignedIn(false);setNotice('Signed out of the cloud workspace.')}}>Sign out</button></section>}
 {error&&<p className="settings-error" role="alert">{error}</p>}{notice&&<p className="settings-notice" role="status">{notice} {status.generation&&<Link href="/">Start building →</Link>}</p>}
 </main>
}
