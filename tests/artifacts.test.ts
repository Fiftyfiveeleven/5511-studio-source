import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateArtifact,validateConnection,renderPreview} from '../src/lib/artifacts';
test('rejects privileged keys and off-provider connection URLs',()=>{
 const anon=(role:string,ref='abcdefghijklmnopqrst')=>'a.'+Buffer.from(JSON.stringify({role,ref})).toString('base64url')+'.b';
 assert.throws(()=>validateConnection('http://127.0.0.1','anything'));
 assert.throws(()=>validateConnection('https://abcdefghijklmnopqrst.supabase.co.evil.com','sb_publishable_123456789012345'));
 assert.throws(()=>validateConnection('https://abcdefghijklmnopqrst.supabase.co',anon('service_role')));
 assert.throws(()=>validateConnection('https://abcdefghijklmnopqrst.supabase.co',anon('anon','other')));
 assert.equal(validateConnection('https://abcdefghijklmnopqrst.supabase.co/',anon('anon')).url,'https://abcdefghijklmnopqrst.supabase.co');
 assert.deepEqual(validateConnection('',''),{url:null,key:null});
});
test('rejects path traversal, missing entrypoint and duplicate output files',()=>{
 const artifact={name:'Demo',summary:'Done',sql:'',files:[{path:'../secret',content:'bad'}]};
 assert.throws(()=>validateArtifact(artifact));
 assert.throws(()=>validateArtifact({...artifact,files:[{path:'app.js',content:''}]}));
 assert.throws(()=>validateArtifact({...artifact,files:[{path:'index.html',content:''},{path:'index.html',content:''}]}));
});
test('standalone preview loads one local script and protects config script context',()=>{
 const rendered=renderPreview([{path:'index.html',content:'<html><head><link rel="stylesheet" href="styles.css"></head><body><script src="app.js" type="module"></script></body></html>'},{path:'app.js',content:'document.body.dataset.working="yes"'},{path:'styles.css',content:'body { color: red; }'}],{url:'https://example.supabase.co',key:'</script><script>bad()</script>'});
 assert.ok(!rendered.includes('src="app.js"'));
 assert.ok(!rendered.includes('href="styles.css"'));
 assert.ok(rendered.includes('window.STUDIO_CONFIG='));
 assert.ok(!rendered.includes('<script>bad()'));
 assert.ok(rendered.includes('document.body.dataset.working'));
});
