import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const metadata = {
  title: "Agent bug report - django-login-app",
  description: "Bug report logged by the persistent C-API and C-UI agents.",
};

export const dynamic = "force-dynamic";

type AgentBugReport = {
  slug: string;
  title: string;
  markdown: string;
  updatedAt: string;
  openCount: number;
};

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_BACKEND_URL ||
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function loadAgentBugReport(): Promise<
  | { report: AgentBugReport; error?: never }
  | { report?: never; error: string }
> {
  try {
    const response = await fetch(`${API_BASE}/api/agent-bug-report/`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return { error: `Could not load agent bug report (${response.status}).` };
    }
    return { report: (await response.json()) as AgentBugReport };
  } catch {
    return { error: "Could not load agent bug report." };
  }
}

export default async function AgentBugsPage() {
  const result = await loadAgentBugReport();

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
          Live database-backed report for bugs logged by the persistent tester
          agents <strong>C-API</strong> and <strong>C-UI</strong>. This page
          fetches from Django on every request, so report updates do not require
          a frontend redeploy.
        </p>

        <div className="findings-summary">
          <div className="findings-summary-totals">
            <span className="findings-summary-num">
              {result.report?.openCount ?? "!"}
            </span>
            <span className="findings-summary-label">open agent findings</span>
          </div>
          <p className="findings-summary-note">
            {result.report ? (
              <>
                Database report updated at{" "}
                <time dateTime={result.report.updatedAt}>
                  {new Date(result.report.updatedAt).toLocaleString("en-US", {
                    timeZone: "UTC",
                    timeZoneName: "short",
                  })}
                </time>
                .
              </>
            ) : (
              result.error
            )}
          </p>
        </div>
      </header>

      <main className="findings-main">
        <section className="findings-section">
          <article className="findings-markdown">
            {result.report ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {result.report.markdown}
              </ReactMarkdown>
            ) : (
              <div className="alert-error" role="alert">
                {result.error}
              </div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
}
