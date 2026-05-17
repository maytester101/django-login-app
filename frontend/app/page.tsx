"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";

type AgentName = "C-API" | "C-UI";
type AgentTarget = "local" | "production";
type RunningAgent = `${AgentName}-${AgentTarget}`;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [runningAgent, setRunningAgent] = useState<RunningAgent | null>(null);
  const [agentResults, setAgentResults] = useState<Record<AgentTarget, string>>({
    local: "",
    production: "",
  });

  useEffect(() => {
    api.me().then(() => router.replace("/attempts")).catch(() => undefined);
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");

    try {
      await api.login(username, password);
      router.push("/attempts");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Sign in failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function runAgent(agent: AgentName, target: AgentTarget) {
    setRunningAgent(`${agent}-${target}`);
    setAgentResults((current) => ({ ...current, [target]: "" }));

    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, target }),
      });
      const data = (await response.json()) as { output?: string; detail?: string };
      setAgentResults((current) => ({
        ...current,
        [target]: data.output || data.detail || "Agent run completed.",
      }));
    } catch {
      setAgentResults((current) => ({
        ...current,
        [target]: "Could not start the local agent runner.",
      }));
    } finally {
      setRunningAgent(null);
    }
  }

  return (
    <div className="centered-page">
      <main className="home-stack">
        <section className="card">
          <h1>Sign in</h1>
          <p className="subtitle">Use your username and password.</p>

          {error ? (
            <div className="alert-error" role="alert">
              {error}
            </div>
          ) : null}

          <form onSubmit={onSubmit}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              autoFocus
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />

            <button type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <Link className="btn-secondary" href="/register">
            Create account
          </Link>
        </section>

        <section className="card testing-card" aria-labelledby="testing-title">
          <h2 id="testing-title">Testing on local</h2>
          <div className="testing-actions" aria-label="Run testing agents">
            <button
              className="btn-secondary"
              type="button"
              onClick={() => runAgent("C-API", "local")}
              disabled={runningAgent !== null}
            >
              {runningAgent === "C-API-local"
                ? "Running API testing agent C-API…"
                : "Run API testing agent C-API"}
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => runAgent("C-UI", "local")}
              disabled={runningAgent !== null}
            >
              {runningAgent === "C-UI-local"
                ? "Running UI testing agent C-UI…"
                : "Run UI testing agent C-UI"}
            </button>
          </div>
          {agentResults.local ? (
            <pre className="agent-run-output" aria-live="polite">
              {agentResults.local}
            </pre>
          ) : null}
        </section>

        <section
          className="card testing-card"
          aria-labelledby="testing-production-title"
        >
          <h2 id="testing-production-title">Testing on production</h2>
          <div className="testing-actions" aria-label="Run production testing agents">
            <button
              className="btn-secondary"
              type="button"
              onClick={() => runAgent("C-API", "production")}
              disabled={runningAgent !== null}
            >
              {runningAgent === "C-API-production"
                ? "Running API testing agent C-API…"
                : "Run API testing agent C-API"}
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => runAgent("C-UI", "production")}
              disabled={runningAgent !== null}
            >
              {runningAgent === "C-UI-production"
                ? "Running UI testing agent C-UI…"
                : "Run UI testing agent C-UI"}
            </button>
          </div>
          {agentResults.production ? (
            <pre className="agent-run-output" aria-live="polite">
              {agentResults.production}
            </pre>
          ) : null}
        </section>

        <section className="card testing-card" aria-labelledby="reports-title">
          <h2 id="reports-title">Reports</h2>
          <p className="findings-link">
            <Link href="/findings">View QA findings →</Link>
          </p>
          <p className="findings-link">
            <Link href="/agent-bugs">View agent bug report →</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
