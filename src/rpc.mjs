import catalog from './agent.json' with { type: 'json' };
import { pathToFileURL } from 'node:url';
const origin = 'https://students.yes.rollersoft.com.au';
export async function invoke(request, transport = fetch, token = process.env.STUDYLINK_STUDENTS_TOKEN) {
  const p = request.params ?? {};
  if (request.version !== 1 || !p || typeof p !== 'object' || Array.isArray(p)) throw Error('invalid_request');
  const definition = catalog.methods[request.method];
  if (!definition) throw Error('method_not_found');
  const schema = definition.params;
  if (Object.keys(p).some(k => !Object.hasOwn(schema.properties, k)) || (schema.required ?? []).some(k => !Object.hasOwn(p, k))) throw Error('invalid_request');
  for (const [key, value] of Object.entries(p)) {
    const s = schema.properties[key];
    if (s.const !== undefined && value !== s.const || s.type === 'string' && (typeof value !== 'string' || value.length < (s.minLength ?? 0) || value.length > (s.maxLength ?? Infinity) || s.pattern && !new RegExp(s.pattern).test(value)) || s.type === 'integer' && (!Number.isSafeInteger(value) || value < s.minimum) || s.type === 'boolean' && typeof value !== 'boolean') throw Error('invalid_request');
  }
  if (!token) throw Error('credential_missing');
  let path = '/v1/students', method = 'GET', body;
  if (request.method === 'education.students.read') path += '?view=summary&pageSize=20&page=' + (p.page ?? 1) + '&q=' + encodeURIComponent(p.q ?? '');
  else if (request.method === 'education.profile.schema') path = '/v1/profile-schema';
  else if (request.method === 'education.student.create') { method = 'POST'; body = {record:{id:p.id,name:p.name,raw:p.raw}}; }
  else {
    path += '/' + encodeURIComponent(p.id);
    if (request.method === 'education.student.update') { method = 'PATCH'; const {id, confirmed, ...patch} = p; body = patch; }
    if (request.method === 'education.student.delete') { method = 'DELETE'; body = {expectedVersion:p.expectedVersion}; }
  }
  const response = await transport(origin + path, {method, headers:{Authorization:'Bearer ' + token,...(body ? {'content-type':'application/json'} : {}),...(p.idempotencyKey ? {'Idempotency-Key':p.idempotencyKey} : {})}, body:body ? JSON.stringify(body) : undefined, redirect:'error',signal:AbortSignal.timeout(20000)});
  const data = await response.json();
  const schemaResponse = request.method === 'education.profile.schema' && data.schemaVersion === 1 && Array.isArray(data.factKinds);
  if (!response.ok || (data.ok !== true && !schemaResponse)) {
    const allowed = new Set(['unauthorized','forbidden','version_conflict','student_not_found','student_exists','idempotency_conflict','idempotency_resource_deleted','invalid_data','profile_too_large_or_invalid','custom_definition_not_registered','education_replacement_confirmation_required','course_replacement_confirmation_required']);
    throw Error(allowed.has(data.error) ? data.error : 'upstream_failed');
  }
  return data;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let raw = '';
    for await (const chunk of process.stdin) { raw += chunk; if (Buffer.byteLength(raw) > 262144) throw Error('invalid_request'); }
    let request; try { request = JSON.parse(raw); } catch { throw Error('invalid_request'); }
    console.log(JSON.stringify({version:1,ok:true,result:await invoke(request)}));
  } catch (error) {
    const safe = /^(invalid_request|method_not_found|credential_missing|unauthorized|forbidden|version_conflict|student_not_found|student_exists|idempotency_conflict|idempotency_resource_deleted|invalid_data|profile_too_large_or_invalid|custom_definition_not_registered|education_replacement_confirmation_required|course_replacement_confirmation_required|upstream_failed)$/;
    console.log(JSON.stringify({version:1,ok:false,error:{code:safe.test(error.message) ? error.message : 'request_failed',message:'学生服务操作未确认；写入失败或超时后先读回，不要盲目重试。'}}));
    process.exitCode = 1;
  }
}
