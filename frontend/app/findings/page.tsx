// QA findings page.
//
// Displays the contents of every findings file in the repo (qa/findings.md +
// qa/specialists/<name>/findings.md), grouped by source. Public route by
// design — May uses these bugs for demo purposes. See MEMORY.md "DEMO HOLD".
//
// This is a server component. The markdown is read from disk at build time
// (see `findings.ts::loadFindings`), so the HTML is fully static — no fs,
// DB, or API calls at request time.

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FindingsSource,
  REPO_BLOB,
  REPO_URL,
  Severity,
  loadFindings,
  rollup,
} from "./findings";

export const metadata = {
  title: "QA findings — django-login-app",
  description: "Open bug findings from Q's QA team, grouped by specialist.",
};

const SEVERITY_META: Record<Severity, { emoji: string; label: string; cssClass: string }> = {
  critical: { emoji: "🔴", label: "Critical", cssClass: "sev-critical" },
  high: { emoji: "🟠", label: "High", cssClass: "sev-high" },
  medium: { emoji: "🟡", label: "Medium", cssClass: "sev-medium" },
  low: { emoji: "🟢", label: "Low", cssClass: "sev-low" },
};

export default function FindingsPage() {
  const sources = loadFindings();
  const totals = rollup(sources);

  return (
    <div className="findings-page">
      <header className="findings-header">
        <div className="findings-header-top">
          <h1>QA findings</h1>
          <nav className="findings-nav" aria-label="Site navigation">
            <Link href="/">Sign in</Link>
            <Link href="/register">Register</Link>
            <Link href="/attempts">Login attempts</Link>
            <Link href="/agent-bugs">Agent bugs</Link>
          </nav>
        </div>
        <p className="findings-subtitle">
          Live snapshot of the bug log maintained by <strong>Q</strong>, the QA
          manager for this project. Sourced directly from the markdown files
          under <code>qa/</code> in the{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            project repo
          </a>
          . Each specialist owns its own findings file; this page renders all
          six and groups them by source.
        </p>

        <div className="findings-summary">
          <div className="findings-summary-totals">
            <span className="findings-summary-num">{totals.total}</span>
            <span className="findings-summary-label">logged findings</span>
          </div>
          <ul className="findings-summary-counts">
            {(Object.keys(SEVERITY_META) as Severity[]).map((sev) => {
              const meta = SEVERITY_META[sev];
              return (
                <li key={sev} className={meta.cssClass}>
                  <span aria-hidden="true">{meta.emoji}</span>
                  <span className="findings-sev-num">{totals[sev]}</span>
                  <span className="findings-sev-label">{meta.label}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="findings-count-note">
          Counts above include every BUG-… heading across the files.{" "}
          <code>BUG-API-001</code> and <code>BUG-SEC-002</code> describe the
          same root-cause bug from two angles (contract drift vs. CSRF
          bypass) and are cross-referenced in each file, so the index in{" "}
          <code>qa/findings.md</code> reports them as a single unique bug
          — hence 20 unique vs. {totals.total} logged.
        </p>

        <nav aria-label="Jump to source" className="findings-toc">
          <span className="findings-toc-label">Jump to:</span>
          <ul>
            {sources.map((s) => (
              <li key={s.key}>
                <a href={`#${s.key}`}>
                  {s.title}
                  <span className="findings-toc-count">
                    {s.placeholder ? "—" : s.total}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="findings-main">
        {sources.map((source) => (
          <SourceSection key={source.key} source={source} />
        ))}
      </main>

      <footer className="findings-footer">
        <p>
          Manager-direct findings carry the <code>BUG-NNN</code> prefix; each
          specialist&rsquo;s findings use its own namespace (e.g.{" "}
          <code>BUG-API-NNN</code>, <code>BUG-SEC-NNN</code>). Severity counts
          are derived from the rendered markdown headings, so they match the
          file contents exactly.
        </p>
        <p>
          See{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            the repo
          </a>{" "}
          for full QA conventions, manager skill, and specialist playbooks.
        </p>
      </footer>
    </div>
  );
}

function SourceSection({ source }: { source: FindingsSource }) {
  return (
    <section id={source.key} className="findings-section">
      <div className="findings-section-head">
        <h2>
          {source.title}
          {source.placeholder ? (
            <span className="findings-pill findings-pill-muted">
              no runs yet
            </span>
          ) : (
            <SeverityPills counts={source.counts} />
          )}
        </h2>
        <p className="findings-section-blurb">{source.blurb}</p>
        <p className="findings-section-meta">
          ID prefix: <code>{source.idPrefix}-NNN</code> · Source:{" "}
          <a
            href={`${REPO_BLOB}/${source.repoPath}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.repoPath}
          </a>
        </p>
      </div>

      <article className="findings-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {source.markdown}
        </ReactMarkdown>
      </article>
    </section>
  );
}

function SeverityPills({ counts }: { counts: Record<Severity, number> }) {
  return (
    <span className="findings-pills">
      {(Object.keys(SEVERITY_META) as Severity[]).map((sev) => {
        const meta = SEVERITY_META[sev];
        const n = counts[sev];
        if (n === 0) return null;
        return (
          <span key={sev} className={`findings-pill ${meta.cssClass}`}>
            {meta.emoji} {n} {meta.label}
          </span>
        );
      })}
    </span>
  );
}
