import {mkdir,writeFile} from 'node:fs/promises';
import {benchmarkFixtures} from './phase-one-fixtures';
import {validateFullstack,acceptanceTests} from '../src/lib/fullstack-project';
import {checkRuntime,runtimeReady} from '../src/lib/runtime-sandbox';
async function main(){
const live=process.argv.includes('--runtime');if(live&&!runtimeReady())throw new Error('Configure the documented Sandbox credentials before --runtime.');
const results=[];for(const fixture of benchmarkFixtures){const start=Date.now();validateFullstack(fixture.files);const requirements=acceptanceTests(fixture.files);const report=live?await checkRuntime(fixture.files,true):null;results.push({name:fixture.name,requirements:requirements.requirements.length,structuralValidation:true,runtime:report??'NOT RUN',durationMs:Date.now()-start,aiCostUsd:0,runtimeCostUsd:null,passed:report?report.compiled&&!report.errors.length&&report.requirements.every(r=>r.passed):null});}await mkdir('dist',{recursive:true});await writeFile('dist/phase-one-benchmark.json',JSON.stringify({generatedAt:new Date().toISOString(),mode:live?'sandbox':'structure-only',results},null,2));console.log(JSON.stringify(results,null,2));

}
main().catch(e=>{console.error(e.message);process.exitCode=1});
