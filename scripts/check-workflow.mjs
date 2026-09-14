import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the generated worker registry, not just the uncompiled function.
const path='src/app/.well-known/workflow/v1/flow/route.js';
const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
let initializer;
for(const statement of source.statements){
 if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){
  if(declaration.name.getText(source)==='workflowCode')initializer=declaration.initializer;
 }
}
if(!initializer)throw new Error('Generated workflow bundle is missing.');
const code=vm.runInNewContext(initializer.getText(source));
const context=vm.createContext({});
vm.runInContext('globalThis[Symbol.for("WORKFLOW_USE_STEP")]=()=>()=>{throw new Error("Build verification must not execute a paid step")}',context);
vm.runInContext(code,context,{timeout:5000});
const registered=vm.runInContext('globalThis.__private_workflows.has("workflow//./src/workflows/build-project//buildProjectWorkflow")',context);
if(!registered)throw new Error('Build workflow was not registered. Refusing to deploy a broken worker.');
console.log('Verified generated build workflow registration.');
