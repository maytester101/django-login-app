export type LoginAttempt = {
  timestamp: string;
  username: string;
  success: boolean;
};

export type AuthUser = {
  username: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

let csrfToken: string | null = null;
let csrfReady: Promise<void> | null = null;

function resetCsrf(): void {
  csrfToken = null;
  csrfReady = null;
}

async function ensureCsrf(force = false): Promise<void> {
  if (force) {
    resetCsrf();
  }
  if (!csrfReady) {
    csrfReady = (async () => {
      const response = await fetch(apiUrl("/api/csrf/"), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new ApiError("Could not load CSRF token.", response.status);
      }
      const data = (await response.json()) as { csrfToken?: string };
      csrfToken = data.csrfToken || getCookie("csrftoken");
    })();
  }
  await csrfReady;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retryingAfterCsrf = false,
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const mutates = method !== "GET" && method !== "HEAD";
  if (mutates) {
    await ensureCsrf();
  }

  const headers = new Headers(options.headers);
  if (mutates) {
    const token = csrfToken || getCookie("csrftoken");
    if (token) {
      headers.set("X-CSRFToken", token);
    }
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? (JSON.parse(text) as { detail?: string }) : null;

  if (!response.ok) {
    if (
      mutates &&
      response.status === 403 &&
      !retryingAfterCsrf &&
      data?.detail?.toLowerCase().includes("csrf")
    ) {
      await ensureCsrf(true);
      return apiRequest<T>(path, options, true);
    }
    throw new ApiError(data?.detail || "Request failed.", response.status);
  }

  // Django rotates the CSRF token during login/register, so refresh before the
  // next POST (notably logout) instead of reusing a stale token.
  if (mutates) {
    resetCsrf();
  }

  return data as T;
}

export const api = {
  me: () => apiRequest<AuthUser>("/api/me/"),
  login: (username: string, password: string) =>
    apiRequest<AuthUser>("/api/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, password: string) =>
    apiRequest<AuthUser>("/api/register/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => apiRequest<void>("/api/logout/", { method: "POST" }),
  attempts: () => apiRequest<LoginAttempt[]>("/api/attempts/"),
};
