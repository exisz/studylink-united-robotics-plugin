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
  if (value.students.length > MAX_STUDENTS) throw new Error("invalid_response");
  const api = value.source === "studylink-partner-api-read-only";
  if (value.source !== undefined && !api && value.source !== "studylink-portal-admin-read-only") throw new Error("invalid_response");
  if (!Number.isFinite(Date.parse(value.capturedAt)) || !count(value.page.number, 1000000) || value.page.number < 1 || !count(value.page.shown, MAX_STUDENTS)) throw new Error("invalid_response");
  if (api) {
    if (value.environment !== "preprod" || !isRecord(value.branch) || !bounded(value.branch.id, 128) || !bounded(value.branch.name, 256) || value.page.number !== 1 || value.page.total !== null || typeof value.page.hasNextPage !== "boolean") throw new Error("invalid_response");
  } else if (!count(value.page.total, 100000000) || value.page.total < value.page.shown) throw new Error("invalid_response");
  if (value.page.shown !== value.students.length) throw new Error("invalid_response");

  const ids = new Set();
  const students = value.students.map((student) => {
    if (!isRecord(student) || !bounded(student.id, 128) || ids.has(student.id) || !bounded(student.name, 256) || !bounded(student.branch, 256)) {
      throw new Error("invalid_response");
    }
    if (api && student.branch !== value.branch.name) throw new Error("invalid_response");
    ids.add(student.id);
    return student;
  });

  return { page: value.page, students, capturedAt: value.capturedAt, api, branch: value.branch };
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
  const branchLabel = view.api ? `${view.branch.name} (#${view.branch.id})` : branches.size === 1 ? [...branches][0] : `${branches.size} branches`;
  const sourceLabel = view.api ? "Partner API · preprod" : "StudyLink Portal";
  const pageLabel = view.api
    ? `returned ${view.page.shown} records (first page, limit 50) · total unknown · ${view.page.hasNextPage ? "next page available, not fetched" : "no next page reported"}`
    : `showing ${view.page.shown} of ${view.page.total} records (page ${view.page.number})`;
  const provenance = `${sourceLabel} · Snapshot, not live · Captured ${view.capturedAt} · ${branchLabel} · ${pageLabel}`;

  return (
    <section className="ur-education" aria-label="Education plugin">
      <style>{styles}</style>
      <div className="ur-education__compact" role="status" title={provenance} aria-label={provenance}>
        <strong>{view.students.length} STUDENTS</strong>
        <span>{view.students.length ? view.students.slice(0, 3).map((student) => student.name).join(" · ") : "No students returned"}</span>
        <b>{view.api ? "API PREPROD · SNAPSHOT" : `OF ${view.page.total}`}</b>
      </div>
      <div className="ur-education__details">
        <header>
          <div><p>CAPITAL / EDUCATION</p><h2>Students</h2></div>
          <span>READ ONLY</span>
        </header>
        <p className="ur-education__branch">{sourceLabel} · Snapshot, not live<br />Captured <time dateTime={view.capturedAt}>{view.capturedAt}</time></p>
        <p className="ur-education__branch">{branchLabel} · {pageLabel}</p>
        {view.students.length === 0 && <p className="ur-education__branch" role="status">No students returned for this branch.</p>}
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
