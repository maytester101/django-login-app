// Build-time loader for the QA findings files.
//
// These files live OUTSIDE the frontend/ directory (at the repo root in
// `qa/`), so we resolve relative to `process.cwd()` which is `frontend/`
// during `next build`. Vercel clones the full repo, so the paths exist
// on the build machine too.
//
// This module is imported only by server components, never shipped to
// the client. The fs reads happen once at build time and the result is
// inlined into the static HTML output.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type Severity = "critical" | "high" | "medium" | "low";

export type FindingsSource = {
  /** Stable handle used by the page for grouping and links. */
  key: string;
  /** Human-readable specialist or manager name. */
  title: string;
  /** Short tag describing where this source's bugs come from. */
  blurb: string;
  /** Bug-ID prefix used in this file (e.g. "BUG-API"). */
  idPrefix: string;
  /** Repo-relative path for the "source" link back to GitHub. */
  repoPath: string;
  /** Raw markdown contents. */
  markdown: string;
  /** Severity counts derived from the markdown headings. */
  counts: Record<Severity, number>;
  /** Total findings in the file (sum of counts). */
  total: number;
  /** True for placeholder files that haven't been run against the app yet. */
  placeholder: boolean;
};

type SourceSpec = Omit<FindingsSource, "markdown" | "counts" | "total" | "placeholder">;

const REPO_ROOT = resolve(process.cwd(), "..");

const SOURCES: SourceSpec[] = [
  {
    key: "manager",
    title: "Manager-direct findings (Q)",
    blurb:
      "Bugs the QA manager (Q) caught during recon, PR review, or live-prod smoke — outside any specialist run.",
    idPrefix: "BUG",
    repoPath: "qa/findings.md",
  },
  {
    key: "api-tester",
    title: "api-tester",
    blurb: "REST endpoint contracts: status codes, payloads, auth boundaries, error shapes.",
    idPrefix: "BUG-API",
    repoPath: "qa/specialists/api-tester/findings.md",
  },
  {
    key: "security-tester",
    title: "security-tester",
    blurb: "Auth bypass, CSRF, injection, XSS, rate limiting, timing attacks.",
    idPrefix: "BUG-SEC",
    repoPath: "qa/specialists/security-tester/findings.md",
  },
  {
    key: "ui-tester",
    title: "ui-tester",
    blurb:
      "End-to-end browser flows with Playwright; happy paths, error states, cross-origin cookie behavior.",
    idPrefix: "BUG-UI",
    repoPath: "qa/specialists/ui-tester/findings.md",
  },
  {
    key: "data-tester",
    title: "data-tester",
    blurb:
      "Schema integrity, migration safety, login-attempt logging fidelity, SQLite vs Neon parity.",
    idPrefix: "BUG-DATA",
    repoPath: "qa/specialists/data-tester/findings.md",
  },
  {
    key: "exploratory-tester",
    title: "exploratory-tester",
    blurb: "Free-form \"try to break it\" sessions for high-risk releases and bug-class follow-ups.",
    idPrefix: "BUG-EXP",
    repoPath: "qa/specialists/exploratory-tester/findings.md",
  },
];

/**
 * Count findings per severity by looking for headings whose text starts with
 * a severity emoji followed by a BUG-… id. This is the same shape every
 * specialist SKILL.md mandates, so the counts match the per-file headings
 * exactly (and we don't have to trust a human-edited "Index by severity"
 * table).
 */
function countSeverities(markdown: string, idPrefix: string): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  // Match headings of any level whose first non-space token is a severity
  // emoji and which contain the file's BUG-… prefix anywhere on the line.
  const lines = markdown.split("\n");
  for (const line of lines) {
    if (!line.startsWith("#")) continue;
    if (!line.includes(`${idPrefix}-`)) continue;
    if (line.includes("🔴")) counts.critical++;
    else if (line.includes("🟠")) counts.high++;
    else if (line.includes("🟡")) counts.medium++;
    else if (line.includes("🟢")) counts.low++;
  }
  return counts;
}

function isPlaceholder(markdown: string): boolean {
  return /No runs yet\./i.test(markdown);
}

export function loadFindings(): FindingsSource[] {
  return SOURCES.map((spec) => {
    const absolute = join(REPO_ROOT, spec.repoPath);
    const markdown = readFileSync(absolute, "utf8");
    const counts = countSeverities(markdown, spec.idPrefix);
    const total = counts.critical + counts.high + counts.medium + counts.low;
    return {
      ...spec,
      markdown,
      counts,
      total,
      placeholder: isPlaceholder(markdown) && total === 0,
    };
  });
}

export function rollup(sources: FindingsSource[]): Record<Severity, number> & { total: number } {
  const rollup = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const s of sources) {
    rollup.critical += s.counts.critical;
    rollup.high += s.counts.high;
    rollup.medium += s.counts.medium;
    rollup.low += s.counts.low;
    rollup.total += s.total;
  }
  return rollup;
}

export const REPO_URL = "https://github.com/maytester101/django-login-app";
export const REPO_BLOB = `${REPO_URL}/blob/main`;
