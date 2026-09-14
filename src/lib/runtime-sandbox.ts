import {instrumentRuntimePreview} from './design-source';
import {Sandbox} from '@vercel/sandbox';
import {validateFullstack,acceptanceTests} from './fullstack-project';
import type {SourceFile} from './types';
export function sandboxCredentials(){return process.env.VERCEL_TOKEN&&process.env.VERCEL_TEAM_ID&&process.env.VERCEL_PROJECT_ID?{token:process.env.VERCEL_TOKEN,teamId:process.env.VERCEL_TEAM_ID,projectId:process.env.VERCEL_PROJECT_ID}:{};}
export function runtimeReady(){return process.env.STUDIO_SANDBOX_ENABLED==='true'&&!!(process.env.VERCEL||process.env.VERCEL_OIDC_TOKEN||(process.env.VERCEL_TOKEN&&process.env.VERCEL_PROJECT_ID&&process.env.VERCEL_TEAM_ID));}
export type RuntimeReport={compiled:boolean;requirements:{id:string;description:string;passed:boolean;error?:string}[];errors:string[];previewUrl?:string;expiresAt?:string};
// Runs outside the app VM: generated code never receives Studio/provider credentials.
export const testRunner=`const {chromium}=require('/vercel/checker/node_modules/playwright');const fs=require('fs');(async()=>{const spec=JSON.parse(fs.readFileSync('/vercel/checker/tests.json','utf8'));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const results=[];for(const r of spec.requirements){const context=await browser.newContext();await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin==='http://127.0.0.1:3000'?route.continue():route.abort()});const page=await context.newPage();page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));try{for(const s of r.steps){const locator=s.target?page.locator(s.target):null;if(s.action==='goto')await page.goto('http://127.0.0.1:3000'+s.value);if(s.action==='click')await locator.click();if(s.action==='fill')await locator.fill(s.value);if(s.action==='visible')await locator.waitFor({state:'visible'});if(s.action==='text'){await locator.filter({hasText:s.value}).waitFor({state:'visible'})}if(s.action==='url')await page.waitForURL(url=>url.pathname===s.value)}if(errors.length)throw Error(errors.join('; '));results.push({id:r.id,description:r.description,passed:true})}catch(e){results.push({id:r.id,description:r.description,passed:false,error:String(e.message).slice(0,800)})}finally{await context.close()}}await browser.close();fs.writeFileSync('/vercel/checker/report.json',JSON.stringify(results))})().catch(e=>{console.error(e.message);process.exit(1)});`;
export async function checkRuntime(files:SourceFile[],runTests:boolean,create=Sandbox.create,preview=false,design?:{channel:string;origin:string}):Promise<RuntimeReport>{
 validateFullstack(files);const spec=runTests?acceptanceTests(files):null;
 const sandbox=await create({...sandboxCredentials(),...(process.env.STUDIO_SANDBOX_SNAPSHOT?{source:{type:'snapshot' as const,snapshotId:process.env.STUDIO_SANDBOX_SNAPSHOT}}:{runtime:'node24'}),ports:preview?[3000]:[],persistent:false,timeout:600000,resources:{vcpus:2},networkPolicy:'allow-all'});
 let keepAlive=false;
 const command=async(cmd:string,args:string[],timeoutMs=180000)=>{const r=await sandbox.runCommand(cmd,args,{timeoutMs});if(r.exitCode!==0)throw new Error((await r.stderr()).slice(-5000)||`${cmd} exited ${r.exitCode}`);return r;};
 try{
  if(runTests&&!process.env.STUDIO_SANDBOX_SNAPSHOT){await command('sudo',['dnf','install','-y','nss','nspr','libxkbcommon','atk','at-spi2-atk','at-spi2-core','libXcomposite','libXdamage','libXrandr','libXfixes','libXcursor','libXi','libXtst','libXScrnSaver','libXext','mesa-libgbm','libdrm','mesa-libGL','mesa-libEGL','cups-libs','alsa-lib','pango','cairo','gtk3','dbus-libs']);await command('npm',['install','--prefix','/vercel/checker','--ignore-scripts','--no-audit','--no-fund','playwright@1.58.2']);await command('node',['/vercel/checker/node_modules/playwright/cli.js','install','chromium']);}
  const app=await sandbox.createUser('studioapp');const cwd=app.homeDir+'/app';await app.runCommand('mkdir',['-p',cwd]);
  const appCommand=async(cmd:string,args:string[],timeoutMs=180000)=>{const r=await app.runCommand({cmd,args,cwd,env:{NEXT_TELEMETRY_DISABLED:'1'},timeoutMs});if(r.exitCode!==0)throw new Error((await r.stderr()).slice(-5000)||`${cmd} failed`);return r;};
  await sandbox.updateNetworkPolicy({allow:['registry.npmjs.org']});
  const previewFiles=preview&&design?instrumentRuntimePreview(files,design.channel,design.origin):files;
  await app.writeFiles(previewFiles.map(f=>({path:cwd+'/'+f.path,content:Buffer.from(f.content)})));
  await appCommand('npm',['install','--ignore-scripts','--no-audit','--no-fund']);
  await sandbox.updateNetworkPolicy('deny-all');
  await appCommand('node',['node_modules/next/dist/bin/next','build']);
  if(!runTests&&!preview)return {compiled:true,requirements:[],errors:[]};
  if(runTests)await sandbox.writeFiles([{path:'/vercel/checker/runner.cjs',content:Buffer.from(testRunner)},{path:'/vercel/checker/tests.json',content:Buffer.from(JSON.stringify(spec))}]);
  await app.runCommand({cwd,env:{NEXT_TELEMETRY_DISABLED:'1'},cmd:'node',args:['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port','3000'],detached:true});
  await command('node',['-e',"(async()=>{for(let i=0;i<60;i++){try{await fetch('http://127.0.0.1:3000');return}catch{}await new Promise(r=>setTimeout(r,500))}process.exit(1)})()"],40000);
  if(preview){keepAlive=true;return {compiled:true,requirements:[],errors:[],previewUrl:sandbox.domain(3000),expiresAt:sandbox.expiresAt?.toISOString()??new Date(Date.now()+600000).toISOString()};}
  await command('node',['/vercel/checker/runner.cjs'],180000);
  const bytes=await sandbox.readFileToBuffer({path:'/vercel/checker/report.json'});if(!bytes)throw new Error('No test report returned');
  return {compiled:true,requirements:JSON.parse(bytes.toString()),errors:[]};
 }catch(e){return {compiled:false,requirements:[],errors:[(e as Error).message.slice(0,5000)]}}finally{if(!keepAlive)await sandbox.stop().catch(()=>{});}
}
