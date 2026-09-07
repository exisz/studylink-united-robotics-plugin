import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

function installDom() {
  const dom = new JSDOM("<!doctype html><div id=root></div>", { url: "https://world.test/" });
  const previous = {};
  for (const key of ["window", "document", "Element", "HTMLElement", "Node", "navigator"]) {
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

const result = {
  status: "ready",
  capturedAt: "2026-09-07T08:02:00.000Z",
  student: { id: "student-1", name: "Example Student", branch: "Example Branch" },
  applications: [{ id: "app-1", provider: "Example University", status: "Incomplete", course: "Example Course", updatedAt: "3 Sep 2026" }],
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

test("mount renders one student and plan from one backend call", async () => {
  const restore = installDom();
  try {
    const { mount } = await import(`../dist/plugin.js?test=${Date.now()}`);
    const root = document.querySelector("#root");
    const calls = [];
    const cleanup = mount(root, { invoke: async (method) => { calls.push(method); return result; } });
    await settle();
    assert.deepEqual(calls, ["education.student.read"]);
    assert.match(root.textContent, /Example Student/);
    assert.match(root.textContent, /Example Course/);
    assert.match(root.textContent, /Incomplete/);
    assert.match(root.textContent, /read only/i);
    assert.ok(root.querySelector(".ur-education__compact"));
    cleanup();
    assert.equal(root.childNodes.length, 0);
    cleanup();
  } finally { restore(); }
});

test("backend failures remain inside the Education panel", async () => {
  const restore = installDom();
  try {
    const { mount } = await import(`../dist/plugin.js?error=${Date.now()}`);
    const root = document.querySelector("#root");
    const cleanup = mount(root, { invoke: async () => { throw new Error("private details"); } });
    await settle();
    assert.match(root.textContent, /snapshot unavailable/i);
    assert.doesNotMatch(root.textContent, /private details/i);
    cleanup();
  } finally { restore(); }
});

test("frontend performs no direct network or polling", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile("src/plugin.jsx", "utf8"));
  for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "setTimeout", "setInterval", "localStorage", "sessionStorage"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
