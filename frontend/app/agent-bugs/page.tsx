import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AGENT_BUG_REPORT,
  AGENT_BUG_REPORT_AVAILABLE,
  AGENT_BUG_REPORT_BUILT_AT,
  AGENT_BUG_REPORT_PATH,
} from "./data.generated";

export const metadata = {
  title: "Agent bug report - django-login-app",
  description: "Bug report logged by the persistent C-API and C-UI agents.",
};

const REPO_BLOB = "https://github.com/maytester101/django-login-app/blob/main";

function countOpenFindings(markdown: string): number {
  return markdown
    .split("\n")
    .filter((line) => line.trim().toLowerCase() === "- **status:** open")
    .length;
}

export default function AgentBugsPage() {
  const openCount = countOpenFindings(AGENT_BUG_REPORT);

  return (
    <div className="findings-page">
      <header className="findings-header">
        <div className="findings-header-top">
          <h1>Agent bug report</h1>
          <nav className="findings-nav" aria-label="Site navigation">
            <Link href="/">Sign in</Link>
            <Link href="/register">Register</Link>
            <Link href="/attempts">Login attempts</Link>
            <Link href="/findings">QA findings</Link>
          </nav>
        </div>

        <p className="findings-subtitle">
          Live snapshot of bugs logged by the persistent tester agents{" "}
          <strong>C-API</strong> and <strong>C-UI</strong>. Source markdown:{" "}
          <a
            href={`${REPO_BLOB}/${AGENT_BUG_REPORT_PATH}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {AGENT_BUG_REPORT_PATH}
          </a>
          .
        </p>

        <div className="findings-summary">
          <div className="findings-summary-totals">
            <span className="findings-summary-num">{openCount}</span>
            <span className="findings-summary-label">open agent findings</span>
          </div>
          <p className="findings-summary-note">
            Snapshot built at{" "}
            <time dateTime={AGENT_BUG_REPORT_BUILT_AT}>
              {new Date(AGENT_BUG_REPORT_BUILT_AT).toLocaleString("en-US", {
                timeZone: "UTC",
                timeZoneName: "short",
              })}
            </time>
            .
          </p>
        </div>

        {!AGENT_BUG_REPORT_AVAILABLE ? (
          <p className="findings-count-note">
            The source report was not available when this page was built.
          </p>
        ) : null}
      </header>

      <main className="findings-main">
        <section className="findings-section">
          <article className="findings-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {AGENT_BUG_REPORT}
            </ReactMarkdown>
          </article>
        </section>
      </main>
    </div>
  );
}
