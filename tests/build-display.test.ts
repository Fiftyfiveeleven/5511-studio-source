import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDisplay} from '../src/lib/build-display';
test('a saved revision stays unfinished through checks and preview replacement',()=>{
 const checking=buildDisplay({active:true,saved:true,progress:'Testing navigation and working features',preview:'ready'});assert.equal(checking.ready,false);assert.match(checking.label,/Finishing checks/);
 const updating=buildDisplay({active:false,saved:true,preview:'loading'});assert.equal(updating.ready,false);assert.match(updating.label,/Updating preview/);
 assert.equal(buildDisplay({active:false,saved:true,preview:'ready'}).ready,true);
});
test('failed checks or preview errors never report completion and a next stage remains active',()=>{
 assert.equal(buildDisplay({active:false,saved:true,failed:true,preview:'ready'}).ready,false);
 assert.match(buildDisplay({active:false,saved:true,preview:'error'}).label,/needs attention/);
 assert.equal(buildDisplay({active:true,saved:true,progress:'Designing and writing code · Features'}).label,'Updating your app');
});
