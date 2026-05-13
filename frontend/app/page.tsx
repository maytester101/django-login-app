"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="centered-page">
      <main className="card">
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
      </main>
    </div>
  );
}
