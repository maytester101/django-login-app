"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";

type AgentName = "C-API" | "C-UI";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [runningAgent, setRunningAgent] = useState<AgentName | null>(null);
  const [agentResult, setAgentResult] = useState("");

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

  async function runAgent(agent: AgentName) {
    setRunningAgent(agent);
    setAgentResult(`Starting ${agent} test run on local...`);

    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, target: "local" }),
      });
      const data = (await response.json()) as { output?: string; detail?: string };
      setAgentResult(data.output || data.detail || "Agent run completed.");
    } catch {
      setAgentResult("Could not start the local agent runner.");
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
              onClick={() => runAgent("C-API")}
              disabled={runningAgent !== null}
            >
              {runningAgent === "C-API"
                ? "Running API testing agent C-API on local..."
                : "Run API testing agent C-API on local"}
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => runAgent("C-UI")}
              disabled={runningAgent !== null}
            >
              {runningAgent === "C-UI"
                ? "Running UI testing agent C-UI on local..."
                : "Run UI testing agent C-UI on local"}
            </button>
          </div>
          {agentResult ? (
            <pre className="agent-run-output" aria-live="polite">
              {agentResult}
            </pre>
          ) : null}
        </section>

        <section className="card testing-card" aria-labelledby="reports-title">
          <h2 id="reports-title">Reports</h2>
          <p className="findings-link">
            <Link href="/findings">View QA findings →</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
