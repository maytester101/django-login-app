"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
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
    const nextUsername = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");
    setUsername(nextUsername);

    try {
      await api.register(nextUsername, password);
      router.push("/attempts");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not create account.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="centered-page">
      <main className="card">
        <h1>Create account</h1>
        <p className="subtitle">Choose a username and password.</p>

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
            defaultValue={username}
            required
            autoFocus
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />

          <button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>

        <Link className="back-link" href="/">
          Back to sign in
        </Link>
      </main>
    </div>
  );
}
