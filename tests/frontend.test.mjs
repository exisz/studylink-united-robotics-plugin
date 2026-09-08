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

const students = Array.from({ length: 50 }, (_, index) => ({
  id: `student-${index + 1}`,
  name: `Example Student ${index + 1}`,
  branch: "Example Group - Sydney",
}));

const result = {
  status: "ready",
  capturedAt: "2026-09-07T08:02:00.000Z",
  page: { number: 1, shown: students.length, total: 22514 },
  students,
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

test("mount renders the whole student list from one backend call", async () => {
  const restore = installDom();
  try {
    const { mount } = await import(`../dist/plugin.js?test=${Date.now()}`);
    const root = document.querySelector("#root");
    const calls = [];
    const cleanup = mount(root, { invoke: async (method) => { calls.push(method); return result; } });
    await settle();
    assert.deepEqual(calls, ["education.students.read"]);
    assert.equal(root.querySelectorAll(".ur-education__list li").length, 50);
    const items = [...root.querySelectorAll(".ur-education__list li strong")].map((node) => node.textContent);
    assert.equal(items.length, 50);
    assert.equal(items[0], "Example Student 1");
    assert.equal(items[49], "Example Student 50");
    assert.match(root.textContent, /showing 50 of 22514 records/i);
    assert.match(root.textContent, /50 STUDENTS/);
    assert.match(root.textContent, /read only/i);
    assert.ok(root.querySelector(".ur-education__compact"));
    cleanup();
    assert.equal(root.childNodes.length, 0);
    cleanup();
  } finally { restore(); }
});

test("invalid and failing responses remain inside the Education panel", async () => {
  const restore = installDom();
  try {
    const { mount } = await import(`../dist/plugin.js?error=${Date.now()}`);
    const root = document.querySelector("#root");
    const failing = mount(root, { invoke: async () => { throw new Error("private details"); } });
    await settle();
    assert.match(root.textContent, /student list unavailable/i);
    assert.doesNotMatch(root.textContent, /private details/i);
    failing();

    const invalid = mount(root, { invoke: async () => ({ ...result, page: { number: 1, shown: 7, total: 22514 } }) });
    await settle();
    assert.match(root.textContent, /student list unavailable/i);
    assert.equal(root.querySelectorAll(".ur-education__list li").length, 0);
    invalid();
  } finally { restore(); }
});

test("frontend performs no direct network or polling", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile("src/plugin.jsx", "utf8"));
  for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "setTimeout", "setInterval", "localStorage", "sessionStorage"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("API UI labels snapshot provenance and unknown total without adding search or details", async () => {
  const restore = installDom();
  try {
    const { mount } = await import(`../dist/plugin.js?api=${Date.now()}`);
    const root = document.querySelector("#root");
    for (const n of [0, 50]) {
      const api = { ...result, source: "studylink-partner-api-read-only", environment: "preprod", branch: { id: "branch-example", name: "Example Group - Sydney" }, students: students.slice(0, n), page: { number: 1, shown: n, total: null, hasNextPage: n === 50 } };
      let calls = 0;
      const cleanup = mount(root, { invoke: async () => { calls++; return api; } });
      await settle();
      assert.equal(calls, 1);
      assert.equal(root.querySelectorAll(".ur-education__list li").length, n);
      assert.match(root.textContent, /Partner API · preprod/);
      assert.match(root.textContent, /Snapshot, not live/);
      assert.match(root.textContent, /total unknown/);
      assert.match(root.textContent, /Example Group - Sydney/);
      assert.match(root.textContent, /2026-09-07T08:02:00.000Z/);
      assert.match(root.textContent, n ? /next page available, not fetched/ : /No students returned for this branch/);
      assert.match(root.querySelector(".ur-education__compact").textContent, /API PREPROD · SNAPSHOT/);
      assert.equal(root.querySelectorAll("input,button,a").length, 0);
      assert.doesNotMatch(root.textContent, /22514|production|OF null/);
      cleanup();
    }
  } finally { restore(); }
});

test("API UI rejects mismatched branch and unsupported environment", async () => {
  const restore = installDom();
  try {
    const { mount } = await import(`../dist/plugin.js?apiError=${Date.now()}`);
    const root = document.querySelector("#root");
    const api = { ...result, source: "studylink-partner-api-read-only", environment: "preprod", branch: { id: "branch-example", name: "Example Group - Sydney" }, page: { number: 1, shown: 50, total: null, hasNextPage: true } };
    for (const bad of [{ ...api, environment: "production" }, { ...api, branch: { id: "other", name: "Other branch" } }]) {
      const cleanup = mount(root, { invoke: async () => bad }); await settle();
      assert.match(root.textContent, /Student list unavailable/);
      assert.equal(root.querySelectorAll(".ur-education__list li").length, 0);
      cleanup();
    }
  } finally { restore(); }
});
