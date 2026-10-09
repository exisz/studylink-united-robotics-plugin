import assert from 'node:assert/strict';
import test from 'node:test';
import {invoke} from '../dist/rpc.mjs';
const call = (method, params, transport) => invoke({version:1,method,params}, transport, 'test-credential');
const ok = data => new Response(JSON.stringify({ok:true,...data}));
test('read uses bounded summary query and fixed authenticated origin', async () => {
  const result = await call('education.students.read',{page:2,q:'A & B'},async (url,options) => {
    const u=new URL(url); assert.equal(u.origin,'https://students.yes.rollersoft.com.au');assert.equal(u.searchParams.get('q'),'A & B');assert.equal(u.searchParams.get('pageSize'),'20');assert.equal(options.headers.Authorization,'Bearer test-credential');return ok({records:[]});
  }); assert.deepEqual(result.records,[]);
});
test('create, update and delete preserve upstream concurrency and idempotency contracts', async () => {
  const raw=JSON.stringify({schemaVersion:1,facts:[]});
  await call('education.student.create',{id:'synthetic',name:'TEST ONLY',raw,idempotencyKey:'synthetic-key',confirmed:true}, async (url,o)=>{assert.equal(o.method,'POST');assert.equal(o.headers['Idempotency-Key'],'synthetic-key');assert.deepEqual(JSON.parse(o.body),{record:{id:'synthetic',name:'TEST ONLY',raw}});return ok({record:{id:'synthetic',version:1}});});
  await call('education.student.update',{id:'synthetic',raw,sourceName:'TEST ONLY',expectedVersion:1,confirmed:true},async(url,o)=>{assert.equal(o.method,'PATCH');assert.deepEqual(JSON.parse(o.body),{raw,sourceName:'TEST ONLY',expectedVersion:1});return ok({record:{version:2}});});
  await call('education.student.delete',{id:'synthetic',expectedVersion:2,confirmed:true},async(url,o)=>{assert.equal(o.method,'DELETE');assert.deepEqual(JSON.parse(o.body),{expectedVersion:2});return ok({deleted:true,id:'synthetic'});});
});
test('invalid or unconfirmed writes never reach upstream',async()=>{
  const never=()=>{throw Error('unexpected_network');};
  for(const p of [{id:'a',expectedVersion:1},{id:'a',expectedVersion:1,confirmed:false},{id:'../a',expectedVersion:1,confirmed:true},{id:'a',expectedVersion:0,confirmed:true},{id:'a',expectedVersion:1,confirmed:true,token:'x'}])await assert.rejects(call('education.student.delete',p,never),/invalid_request/);
});
test('upstream scope denial and version conflicts remain actionable without retries',async()=>{
  for(const [status,error]of [[403,'forbidden'],[409,'version_conflict']]){let calls=0;await assert.rejects(call('education.student.read',{id:'synthetic'},async()=>{calls++;return new Response(JSON.stringify({ok:false,error}),{status});}),new RegExp(error));assert.equal(calls,1);}
});
test('missing credentials and unknown methods fail closed',async()=>{
  await assert.rejects(invoke({version:1,method:'education.students.read'},fetch,''),/credential_missing/);
  await assert.rejects(call('shell.exec',{},fetch),/method_not_found/);
});

test('profile schema accepts the service schema envelope without an ok field', async()=>{
 const schema={schemaVersion:1,factKinds:{"contact.email":"text"},maxBytes:100000};
 assert.deepEqual(await call('education.profile.schema',{},async()=>new Response(JSON.stringify(schema))),schema);
});
