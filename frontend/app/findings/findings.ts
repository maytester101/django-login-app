// Build-time loader for the QA findings files.
//
// Markdown contents are NOT read from disk at request time. They're
// snapshotted into `data.generated.ts` by `scripts/build-findings-snapshot.mjs`
// (wired as the `prebuild` / `predev` npm hook), which runs before
// `next build` / `next dev` and reads the live files from `../qa/*.md`.
//
// Why this indirection: Vercel only ships files under the linked project's
// root directory (which is `frontend/`). A direct `fs.readFileSync("../qa/...")`
// in a server component works locally but fails on Vercel because `qa/` isn't
// in the build context. The generated module is self-contained and ships
// inside the bundle.

import {
  FINDINGS_SNAPSHOT,
  FINDINGS_SNAPSHOT_BUILT_AT,
} from "./data.generated";

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
  /** False when the snapshot couldn't read the source file at build time. */
  available: boolean;
  /** Severity counts derived from the markdown headings. */
  counts: Record<Severity, number>;
  /** Total findings in the file (sum of counts). */
  total: number;
  /** True for placeholder files that haven't been run against the app yet. */
  placeholder: boolean;
};

type SourceSpec = {
  key: string;
  title: string;
  blurb: string;
  idPrefix: string;
  repoPath: string;
};

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
 * Count findings per severity by looking for headings whose text contains
 * the file's BUG-… id prefix and a severity emoji. This matches every
 * specialist SKILL.md's mandated heading shape.
 */
function countSeverities(markdown: string, idPrefix: string): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const line of markdown.split("\n")) {
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
  const bySource = new Map(FINDINGS_SNAPSHOT.map((s) => [s.key, s]));
  return SOURCES.map((spec) => {
    const snap = bySource.get(spec.key);
    const markdown = snap?.markdown ?? `# (missing snapshot for ${spec.key})\n`;
    const available = snap?.available ?? false;
    const counts = countSeverities(markdown, spec.idPrefix);
    const total = counts.critical + counts.high + counts.medium + counts.low;
    return {
      ...spec,
      markdown,
      available,
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

export const SNAPSHOT_BUILT_AT = FINDINGS_SNAPSHOT_BUILT_AT;
export const REPO_URL = "https://github.com/maytester101/django-login-app";
export const REPO_BLOB = `${REPO_URL}/blob/main`;
