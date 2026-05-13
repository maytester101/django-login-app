"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, LoginAttempt, api } from "@/lib/api";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export default function AttemptsPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const user = await api.me();
        const rows = await api.attempts();
        if (!active) {
          return;
        }
        setUsername(user.username);
        setAttempts(rows);
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/");
          return;
        }
        setError("Could not load login attempts.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [router]);

  async function onLogout() {
    try {
      await api.logout();
      router.push("/");
    } catch {
      setError("Could not log out.");
    }
  }

  if (loading) {
    return (
      <div className="card-wide">
        <p className="subtitle">Loading…</p>
      </div>
    );
  }

  return (
    <div className="card-wide">
      <header className="page-header">
        <div>
          <h1>Login attempts</h1>
          <p className="user-line">
            Signed in as <strong>{username}</strong>
          </p>
        </div>
        <button type="button" className="btn-logout" onClick={onLogout}>
          Log out
        </button>
      </header>

      {error ? (
        <div className="alert-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="table-card">
        {attempts.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th scope="col">Time (UTC)</th>
                <th scope="col">Username</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={`${attempt.timestamp}-${attempt.username}-${attempt.success}`}>
                  <td>{formatTimestamp(attempt.timestamp)}</td>
                  <td>{attempt.username}</td>
                  <td>
                    {attempt.success ? (
                      <span className="ok">Success</span>
                    ) : (
                      <span className="no">Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">No login attempts recorded yet.</p>
        )}
      </div>
    </div>
  );
}
