import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import styles from "./plugin.css";

const METHOD = "education.student.read";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function bounded(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !value.includes("\0");
}

function normalize(value) {
  if (!isRecord(value) || value.status !== "ready" || !bounded(value.capturedAt, 64) || !isRecord(value.student) || !Array.isArray(value.applications) || value.applications.length > 20) {
    throw new Error("invalid_response");
  }
  if (!bounded(value.student.id, 128) || !bounded(value.student.name, 256) || !bounded(value.student.branch, 256)) throw new Error("invalid_response");
  const ids = new Set();
  const applications = value.applications.map((application) => {
    if (!isRecord(application) || !bounded(application.id, 128) || ids.has(application.id) || !bounded(application.provider, 512) || !bounded(application.status, 128) || !bounded(application.course, 1024) || !bounded(application.updatedAt, 128)) {
      throw new Error("invalid_response");
    }
    ids.add(application.id);
    return application;
  });
  return { student: value.student, applications, capturedAt: value.capturedAt };
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
    return <section className="ur-education" aria-label="Education plugin" aria-busy="true"><style>{styles}</style><div className="ur-education__compact"><strong>Education</strong><span>Loading student…</span><b>READ ONLY</b></div></section>;
  }

  if (view.phase === "error") {
    return <section className="ur-education" aria-label="Education plugin"><style>{styles}</style><div className="ur-education__compact ur-education__compact--error" role="alert"><strong>Education</strong><span>Student snapshot unavailable</span><b>SAFE</b></div></section>;
  }

  const latest = view.applications[0];
  return (
    <section className="ur-education" aria-label="Education plugin">
      <style>{styles}</style>
      <div className="ur-education__compact" role="status">
        <strong>{view.student.name}</strong>
        <span>{latest ? `${latest.status} · ${latest.provider} · ${latest.course}` : view.student.branch}</span>
        <b>{view.applications.length} PLAN{view.applications.length === 1 ? "" : "S"}</b>
      </div>
      <div className="ur-education__details">
        <header>
          <div><p>CAPITAL / EDUCATION</p><h2>{view.student.name}</h2></div>
          <span>READ ONLY</span>
        </header>
        <p className="ur-education__branch">{view.student.branch}</p>
        <div className="ur-education__plans">
          {view.applications.map((application) => (
            <article key={application.id}>
              <div><strong>{application.course}</strong><span>{application.provider}</span></div>
              <div><b>{application.status}</b><small>{application.updatedAt}</small></div>
            </article>
          ))}
        </div>
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
