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

function getCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

let csrfReady: Promise<void> | null = null;

async function ensureCsrf(): Promise<void> {
  if (!csrfReady) {
    csrfReady = fetch("/api/csrf/", { credentials: "include" }).then(() => undefined);
  }
  await csrfReady;
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    await ensureCsrf();
  }

  const headers = new Headers(options.headers);
  if (method !== "GET" && method !== "HEAD") {
    const token = getCookie("csrftoken");
    if (token) {
      headers.set("X-CSRFToken", token);
    }
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
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
    throw new ApiError(data?.detail || "Request failed.", response.status);
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
