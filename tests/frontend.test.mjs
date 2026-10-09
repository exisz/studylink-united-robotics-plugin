import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

function installDom() {
  const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "https://world.test/" });
  const previous = {};
  dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  for (const key of ["window", "document", "Element", "HTMLElement", "Node", "navigator", "getComputedStyle", "MutationObserver", "DOMRect", "ShadowRoot", "ResizeObserver", "KeyboardEvent", "MouseEvent"]) {
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

const settle = () => new Promise(resolve => setTimeout(resolve, 150));

test("student directory reads current service contract and opens exact student", async () => {
 const restore=installDom(); let cleanup;
 try {
  const {mount}=await import('../dist/plugin.js'); const root=document.querySelector('#root');const calls=[];
  cleanup=mount(root,{invoke:async(method,params)=>{calls.push({method,params});return method==='education.students.read'?{ok:true,records:[{id:'synthetic',name:'TEST ONLY'}],total:1}:{ok:true,record:{id:'synthetic',name:'TEST ONLY',version:1,raw:JSON.stringify({schemaVersion:1,facts:[]})}};}});
  await settle();assert.deepEqual(calls[0],{method:'education.students.read',params:{page:1,q:''}});assert.match(root.querySelector('[role=status]').textContent,/共 1 位学生/);
  const button=root.querySelector('.profile-name');assert.ok(button);button.click();await settle();assert.deepEqual(calls[1],{method:'education.student.read',params:{id:'synthetic'}});assert.ok(root.querySelector('[role=dialog]'));cleanup();cleanup=null;assert.equal(root.childNodes.length,0);
 }finally{cleanup?.();restore();}
});
test("failed reads show a safe error instead of stale students", async()=>{
 const restore=installDom();let cleanup;
 try{const {mount}=await import('../dist/plugin.js');const root=document.querySelector('#root');cleanup=mount(root,{invoke:async()=>{throw Error('private upstream details');}});await settle();assert.match(root.querySelector('[role=alert]').textContent,/读取失败/);assert.doesNotMatch(root.textContent,/private upstream details/);assert.equal(root.querySelectorAll('.profile-name').length,0);}finally{cleanup?.();restore();}
});
