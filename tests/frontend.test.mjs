import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

function installDom() {
  const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "https://world.test/" });
  const previous = {};
  dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  for (const key of ["location", "localStorage", "window", "document", "Element", "HTMLElement", "Node", "navigator", "getComputedStyle", "MutationObserver", "DOMRect", "ShadowRoot", "ResizeObserver", "KeyboardEvent", "MouseEvent"]) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  }
  return () => {
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor === undefined) delete globalThis[key];
      else Object.defineProperty(globalThis, key, descriptor);
    }
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 25));
async function waitFor(predicate) { const deadline=Date.now()+5000; while(!predicate()) { if(Date.now()>deadline) throw Error("render did not settle"); await settle(); } }

test("student directory reads current service contract and opens exact student", async () => {
 const restore=installDom(); let cleanup;
 try {
  const {mount}=await import('../dist/plugin.js'); const root=document.querySelector('#root');const calls=[];
  cleanup=mount(root,{invoke:async(method,params)=>{calls.push({method,params});return method==='education.students.read'?{ok:true,records:[{id:'synthetic',name:'TEST ONLY'}],total:1}:{ok:true,record:{id:'synthetic',name:'TEST ONLY',version:1,raw:JSON.stringify({schemaVersion:1,facts:[]})}};}});
  await waitFor(()=>root.querySelector(".profile-name"));assert.deepEqual(calls[0],{method:'education.students.read',params:{page:1,q:''}});assert.match(root.querySelector('[role=status]').textContent,/共 1 位学生/);
  const button=root.querySelector('.profile-name');assert.ok(button);button.click();await waitFor(()=>calls.length>=2 && root.querySelector("[role=dialog]"));assert.deepEqual(calls[1],{method:'education.student.read',params:{id:'synthetic'}});assert.ok(root.querySelector('[role=dialog]'));cleanup();cleanup=null;assert.equal(root.childNodes.length,0);
 }finally{cleanup?.();restore();}
});
test("failed reads show a safe error instead of stale students", async()=>{
 const restore=installDom();let cleanup;
 try{const {mount}=await import('../dist/plugin.js');const root=document.querySelector('#root');cleanup=mount(root,{invoke:async()=>{throw Error('private upstream details');}});await waitFor(()=>root.querySelector("[role=alert]"));assert.match(root.querySelector('[role=alert]').textContent,/读取失败/);assert.doesNotMatch(root.textContent,/private upstream details/);assert.equal(root.querySelectorAll('.profile-name').length,0);}finally{cleanup?.();restore();}
});

test('report drawer renders missing items and coverage without writing facts',async()=>{
 const restore=installDom();let cleanup;const calls=[];
 try{const{mount}=await import('../dist/plugin.js');const root=document.querySelector('#root');cleanup=mount(root,{invoke:async(method,params)=>{calls.push(method);if(method==='education.students.read')return{ok:true,records:[{id:'synthetic',name:'TEST ONLY'}],total:1};if(method==='education.student.read')return{ok:true,record:{id:'synthetic',name:'TEST ONLY',raw:'{"facts":[]}'}};if(method==='education.reports.read')return{ok:true,hasMore:false,reports:[{id:'report-one',applicationId:'123',scopeKey:'education',itemCount:1,current:false,serverReceivedAt:'2026-10-28'}]};if(method==='education.report.read')return{ok:true,report:{id:'report-one',profileId:'synthetic',applicationId:'123',scopeKey:'education',coverage:{complete:false,checked:['education'],unchecked:['hidden'],truncated:false},items:[{question:'School name missing',section:'Education',recordContext:'degree-one',required:'required',state:'empty',reasonCode:'unknown'}]}};throw Error('unexpected_write') }});
 await waitFor(()=>root.querySelector('.profile-name'));root.querySelector('.profile-name').click();await waitFor(()=>Array.from(root.querySelectorAll('button')).some(b=>b.textContent.includes('申请 123')));Array.from(root.querySelectorAll('button')).find(b=>b.textContent.includes('申请 123')).click();await waitFor(()=>root.textContent.includes('School name missing'));assert.match(root.textContent,/检查不完整/);assert.match(root.textContent,/hidden/);assert.ok(calls.every(x=>x.endsWith('.read')));
 }finally{cleanup?.();restore()}
});
