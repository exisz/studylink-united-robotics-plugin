import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import styles from "./plugin.css";

const METHOD = "education.students.read";
const MAX_STUDENTS = 50;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function bounded(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !value.includes("\0");
}

function count(value, maximum) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function normalize(value) {
  if (!isRecord(value) || value.status !== "ready" || !bounded(value.capturedAt, 64) || !isRecord(value.page) || !Array.isArray(value.students)) {
    throw new Error("invalid_response");
  }
  if (value.students.length === 0 || value.students.length > MAX_STUDENTS) throw new Error("invalid_response");
  if (!count(value.page.number, 1000000) || !count(value.page.shown, MAX_STUDENTS) || !count(value.page.total, 100000000)) throw new Error("invalid_response");
  if (value.page.shown !== value.students.length || value.page.total < value.page.shown) throw new Error("invalid_response");

  const ids = new Set();
  const students = value.students.map((student) => {
    if (!isRecord(student) || !bounded(student.id, 128) || ids.has(student.id) || !bounded(student.name, 256) || !bounded(student.branch, 256)) {
      throw new Error("invalid_response");
    }
    ids.add(student.id);
    return student;
  });

  return { page: value.page, students, capturedAt: value.capturedAt };
}

function EducationPanel({ invoke }) {
  const [view, setView] = useState({ phase: "loading" });

  useEffect(() => {
    let active = true;
    invoke(METHOD)
      .then((value) => { if (active) setView({ phase: "ready", ...normalize(value) }); })
      .catch(() => { if (active) setView({ phase: "error" }); });
    return () => { active = false; };
  }, [invoke]);

  if (view.phase === "loading") {
    return <section className="ur-education" aria-label="Education plugin" aria-busy="true"><style>{styles}</style><div className="ur-education__compact"><strong>Education</strong><span>Loading students…</span><b>READ ONLY</b></div></section>;
  }

  if (view.phase === "error") {
    return <section className="ur-education" aria-label="Education plugin"><style>{styles}</style><div className="ur-education__compact ur-education__compact--error" role="alert"><strong>Education</strong><span>Student list unavailable</span><b>SAFE</b></div></section>;
  }

  const branches = new Set(view.students.map((student) => student.branch));
  const branchLabel = branches.size === 1 ? [...branches][0] : `${branches.size} branches`;

  return (
    <section className="ur-education" aria-label="Education plugin">
      <style>{styles}</style>
      <div className="ur-education__compact" role="status">
        <strong>{view.students.length} STUDENTS</strong>
        <span>{view.students.slice(0, 3).map((student) => student.name).join(" · ")}</span>
        <b>OF {view.page.total}</b>
      </div>
      <div className="ur-education__details">
        <header>
          <div><p>CAPITAL / EDUCATION</p><h2>Students</h2></div>
          <span>READ ONLY</span>
        </header>
        <p className="ur-education__branch">{branchLabel} · showing {view.page.shown} of {view.page.total} records (page {view.page.number})</p>
        <ol className="ur-education__list">
          {view.students.map((student, index) => (
            <li key={student.id}>
              <em>{index + 1}</em>
              <div><strong>{student.name}</strong><span>{student.branch}</span></div>
              <b>#{student.id}</b>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function mount(root, { invoke } = {}) {
  if (!(root instanceof Element)) throw new TypeError("Education mount root must be an Element.");
  if (typeof invoke !== "function") throw new TypeError("Education requires an invoke function.");
  let active = true;
  const reactRoot = createRoot(root);
  flushSync(() => reactRoot.render(<EducationPanel invoke={invoke} />));
  return () => {
    if (!active) return;
    active = false;
    reactRoot.unmount();
  };
}
