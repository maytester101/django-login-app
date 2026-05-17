"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AgentName = "C-API" | "C-UI";
type TargetEnvironment = "local" | "production";

const AGENTS: AgentName[] = ["C-API", "C-UI"];

export default function TestingDashboardPage() {
  const [visibleTarget, setVisibleTarget] = useState<TargetEnvironment | null>(null);
  const [runningAgent, setRunningAgent] = useState<{
    agent: AgentName;
    target: TargetEnvironment;
  } | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<
    Record<TargetEnvironment, AgentName[]>
  >({
    local: [],
    production: [],
  });
  const [agentStatus, setAgentStatus] = useState<Record<TargetEnvironment, string>>({
    local: "",
    production: "",
  });

  useEffect(() => {
    const hostname = window.location.hostname;
    setVisibleTarget(
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
        ? "local"
        : "production",
    );
  }, []);

  function toggleAgent(target: TargetEnvironment, agent: AgentName) {
    setSelectedAgents((current) =>
      current[target].includes(agent)
        ? {
            ...current,
            [target]: current[target].filter((selectedAgent) => selectedAgent !== agent),
          }
        : {
            ...current,
            [target]: [...current[target], agent],
          },
    );
  }

  function setStatus(target: TargetEnvironment, status: string) {
    setAgentStatus((current) => ({ ...current, [target]: status }));
  }

  async function runAgent(agent: AgentName, target: TargetEnvironment): Promise<boolean> {
    setRunningAgent({ agent, target });
    setStatus(target, `Running ${agent} on ${target}...`);

    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, target }),
      });
      const data = (await response.json()) as {
        completed?: boolean;
        detail?: string;
        reportUrl?: string;
      };
      if (data.reportUrl || data.completed) {
        return true;
      }
      setStatus(target, data.detail || `${agent} completed, but no report was generated.`);
      return false;
    } catch {
      setStatus(target, `Could not start ${agent}.`);
      return false;
    } finally {
      setRunningAgent(null);
    }
  }

  async function runSelectedAgents(target: TargetEnvironment) {
    const agents = selectedAgents[target];
    if (agents.length === 0) {
      setStatus(target, "Select at least one testing agent.");
      return;
    }

    let savedReports = 0;
    for (const agent of agents) {
      const saved = await runAgent(agent, target);
      if (saved) {
        savedReports += 1;
      } else {
        return;
      }
    }

    setStatus(
      target,
      target === "local"
        ? `${savedReports} local testing report${
            savedReports === 1 ? "" : "s"
          } saved. Open Testing reports to download.`
        : `${savedReports} production test${
            savedReports === 1 ? "" : "s"
          } completed.`,
    );
  }

  function renderTestingCard(target: TargetEnvironment) {
    const title = target === "local" ? "Testing on local" : "Testing on production";
    const selected = selectedAgents[target];
    const isRunningTarget = runningAgent?.target === target;

    return (
      <section className="card testing-card" aria-labelledby={`testing-${target}-title`}>
        <p className="subtitle">Select AI agents for testing and click Run.</p>

        <h2 id={`testing-${target}-title`}>{title}</h2>
        <div className="testing-options" aria-label={`Select ${target} testing agents`}>
          {AGENTS.map((agent) => (
            <label className="testing-option" key={`${target}-${agent}`}>
              <input
                type="checkbox"
                checked={selected.includes(agent)}
                onChange={() => toggleAgent(target, agent)}
                disabled={runningAgent !== null}
              />
              <span>
                {agent === "C-API"
                  ? "API testing agent C-API"
                  : "UI testing agent C-UI"}
              </span>
            </label>
          ))}
        </div>
        <button
          className="btn-primary testing-run-button"
          type="button"
          onClick={() => runSelectedAgents(target)}
          disabled={runningAgent !== null || selected.length === 0}
        >
          {isRunningTarget && runningAgent ? `Running ${runningAgent.agent}...` : "Run"}
        </button>
        {agentStatus[target] ? (
          <p className="agent-run-status" aria-live="polite">
            {agentStatus[target]}
          </p>
        ) : null}
        <p className="findings-link">
          <Link href="/testing-reports">View testing reports →</Link>
        </p>
      </section>
    );
  }

  return (
    <div className="centered-page">
      <main className="home-stack">
        {visibleTarget ? renderTestingCard(visibleTarget) : null}

        <Link className="back-link" href="/">
          Back to sign in
        </Link>
      </main>
    </div>
  );
}
