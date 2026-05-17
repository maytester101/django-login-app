import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_AGENTS = new Set(["C-API", "C-UI"]);
const ALLOWED_TARGETS = new Set(["local", "production"]);

type AgentConfig = {
  name: string;
  model: string;
  role: string;
  targets?: Record<string, unknown>;
  scope?: string[];
};

type TestResult = {
  name: string;
  passed: boolean;
  evidence: string;
};

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type ResponseData = {
  status: number;
  headers: Headers;
  text: string;
  json: JsonValue;
};

type TargetEnvironment = "local" | "production";

type RunnerTargets = {
  apiBase: string;
  webBase: string;
  webOrigin: string;
};

class TestSession {
  private cookies = new Map<string, string>();
  csrfToken = "";

  constructor(
    private readonly baseUrl: string,
    private readonly origin: string,
  ) {}

  async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    options: { csrf?: boolean; extraHeaders?: Record<string, string> } = {},
  ): Promise<ResponseData> {
    const headers = new Headers({
      Accept: "application/json",
      Origin: this.origin,
      ...options.extraHeaders,
    });
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (options.csrf && this.csrfToken) {
      headers.set("X-CSRFToken", this.csrfToken);
    }
    const cookie = this.cookieHeader();
    if (cookie) {
      headers.set("Cookie", cookie);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "manual",
    });

    this.storeCookies(response.headers);
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      text,
      json: parseJson(text),
    };
  }

  async refreshCsrf(): Promise<ResponseData> {
    const response = await this.request("GET", "/api/csrf/");
    if (isObject(response.json) && typeof response.json.csrfToken === "string") {
      this.csrfToken = response.json.csrfToken;
    }
    return response;
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  private storeCookies(headers: Headers): void {
    const rawCookies =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : headers.get("set-cookie")
          ? [headers.get("set-cookie") as string]
          : [];
    for (const rawCookie of rawCookies) {
      const [pair] = rawCookie.split(";");
      const index = pair.indexOf("=");
      if (index > 0) {
        this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
    }
  }
}

function isLocalRequest(request: NextRequest): boolean {
  if (process.env.VERCEL) {
    return false;
  }
  const host = request.headers.get("host") || "";
  return (
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host.startsWith("[::1]:")
  );
}

function trimOutput(value: string): string {
  return value.length > 6000 ? `${value.slice(0, 6000)}\n\n[output truncated]` : value;
}

function parseJson(text: string): JsonValue {
  if (!text) return null;
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return null;
  }
}

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(results: TestResult[], name: string, passed: boolean, evidence: string): void {
  results.push({ name, passed, evidence });
}

function formatResults(
  agent: string,
  config: AgentConfig,
  targets: string[],
  results: TestResult[],
): string {
  const failed = results.filter((result) => !result.passed);
  const lines = [
    `${agent} test run`,
    `Model: ${config.model}`,
    ...targets,
    `Result: ${failed.length === 0 ? "PASS" : "FAIL"}`,
    "",
    ...results.map(
      (result) =>
        `${result.passed ? "PASS" : "FAIL"} | ${result.name} | ${result.evidence}`,
    ),
  ];
  return trimOutput(lines.join("\n"));
}

function getTargets(target: TargetEnvironment, request: NextRequest): RunnerTargets {
  if (target === "production") {
    return {
      apiBase: "https://django-login-api.vercel.app",
      webBase: "https://django-login-web.vercel.app",
      webOrigin: "https://django-login-web.vercel.app",
    };
  }
  return {
    apiBase: "http://127.0.0.1:8000",
    webBase: request.nextUrl.origin,
    webOrigin: request.nextUrl.origin,
  };
}

async function runApiTests(
  config: AgentConfig,
  targets: RunnerTargets,
  target: TargetEnvironment,
): Promise<string> {
  const username = `qa-c-${Date.now()}`;
  const secondUsername = `${username}-b`;
  const password = "Api-pass-12345";
  const secondPassword = "Api-pass-67890";
  const results: TestResult[] = [];
  const session = new TestSession(targets.apiBase, targets.webOrigin);

  let response = await session.request("GET", "/api/agent-bug-report/");
  record(
    results,
    "public agent report endpoint returns JSON",
    response.status === 200 && isObject(response.json),
    `status=${response.status}`,
  );

  response = await session.request("GET", "/api/me/");
  record(
    results,
    "unauthenticated /api/me/ is rejected",
    response.status === 401 || response.status === 403,
    `status=${response.status}`,
  );

  response = await session.request("GET", "/api/attempts/");
  record(
    results,
    "unauthenticated /api/attempts/ is rejected",
    response.status === 401 || response.status === 403,
    `status=${response.status}`,
  );

  response = await session.refreshCsrf();
  record(
    results,
    "/api/csrf/ returns token and CORS headers",
    response.status === 200 &&
      Boolean(session.csrfToken) &&
      response.headers.get("access-control-allow-origin") === targets.webOrigin &&
      response.headers.get("access-control-allow-credentials") === "true",
    `status=${response.status} origin=${response.headers.get("access-control-allow-origin")}`,
  );

  response = await session.request(
    "OPTIONS",
    "/api/login/",
    undefined,
    {
      extraHeaders: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-csrftoken",
      },
    },
  );
  record(results, "CORS preflight /api/login/ succeeds", response.status === 200, `status=${response.status}`);

  response = await session.request(
    "POST",
    "/api/login/",
    { username: "qa-c-no-such-user", password: "bad" },
    { csrf: true },
  );
  record(
    results,
    "invalid login is rejected with JSON detail",
    response.status === 400 && isObject(response.json) && typeof response.json.detail === "string",
    `status=${response.status} body=${response.text}`,
  );

  await session.refreshCsrf();
  response = await session.request(
    "POST",
    "/api/register/",
    { username, password },
    { csrf: true },
  );
  record(
    results,
    "valid registration creates user",
    response.status === 201 && isObject(response.json) && response.json.username === username,
    `status=${response.status} user=${username}`,
  );

  response = await session.request("GET", "/api/me/");
  record(
    results,
    "/api/me/ returns current user",
    response.status === 200 && isObject(response.json) && response.json.username === username,
    `status=${response.status}`,
  );

  response = await session.request("GET", "/api/attempts/");
  record(
    results,
    "/api/attempts/ returns scoped attempts",
    response.status === 200 &&
      Array.isArray(response.json) &&
      response.json.length >= 1 &&
      response.json.every((row) => isObject(row) && row.username === username),
    `status=${response.status} count=${Array.isArray(response.json) ? response.json.length : 0}`,
  );

  await session.refreshCsrf();
  response = await session.request(
    "POST",
    "/api/register/",
    { username, password },
    { csrf: true },
  );
  record(
    results,
    "duplicate username is rejected",
    response.status === 400 && response.text.includes("That username is already taken."),
    `status=${response.status} body=${response.text}`,
  );

  response = await session.request("POST", "/api/logout/", {});
  record(
    results,
    "logout without CSRF is rejected",
    response.status === 403,
    `status=${response.status} body=${response.text}`,
  );

  await session.refreshCsrf();
  response = await session.request("POST", "/api/logout/", {}, { csrf: true });
  record(results, "logout with CSRF succeeds", response.status === 204, `status=${response.status}`);

  await session.refreshCsrf();
  response = await session.request(
    "POST",
    "/api/login/",
    { username, password },
    { csrf: true },
  );
  record(
    results,
    "valid login succeeds after logout",
    response.status === 200 && isObject(response.json) && response.json.username === username,
    `status=${response.status}`,
  );

  const secondSession = new TestSession(targets.apiBase, targets.webOrigin);
  await secondSession.refreshCsrf();
  response = await secondSession.request(
    "POST",
    "/api/register/",
    { username: secondUsername, password: secondPassword },
    { csrf: true },
  );
  record(results, "second user registration succeeds", response.status === 201, `status=${response.status}`);
  response = await secondSession.request("GET", "/api/attempts/");
  record(
    results,
    "attempts are isolated by user",
    response.status === 200 &&
      Array.isArray(response.json) &&
      response.json.every((row) => isObject(row) && row.username === secondUsername),
    `status=${response.status} count=${Array.isArray(response.json) ? response.json.length : 0}`,
  );

  return formatResults(
    "C-API",
    config,
    [
      `Target: ${target}`,
      `API target: ${targets.apiBase}`,
      `Web origin: ${targets.webOrigin}`,
    ],
    results,
  );
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const response = await fetch(url, { cache: "no-store" });
  return { status: response.status, text: await response.text() };
}

async function runUiTests(
  config: AgentConfig,
  targets: RunnerTargets,
  target: TargetEnvironment,
): Promise<string> {
  const results: TestResult[] = [];

  for (const [path, expectedText] of [
    ["/", "Sign in"],
    ["/register", "Create account"],
    ["/findings", "QA findings"],
    ["/agent-bugs", "Agent bug report"],
  ] as const) {
    const response = await fetchText(`${targets.webBase}${path}`);
    record(
      results,
      `${path} renders expected content`,
      response.status === 200 && response.text.includes(expectedText),
      `status=${response.status} expected=${expectedText}`,
    );
  }

  const session = new TestSession(targets.apiBase, targets.webOrigin);
  const username = `qa-c-ui-${Date.now()}`;
  const password = "Ui-pass-12345";

  await session.refreshCsrf();
  let response = await session.request(
    "POST",
    "/api/login/",
    { username: "qa-c-ui-no-such-user", password: "bad" },
    { csrf: true },
  );
  record(
    results,
    "invalid login backend returns UI error message",
    response.status === 400 && response.text.includes("Invalid username or password."),
    `status=${response.status} body=${response.text}`,
  );

  await session.refreshCsrf();
  response = await session.request(
    "POST",
    "/api/register/",
    { username, password },
    { csrf: true },
  );
  record(
    results,
    "registration flow backend creates throwaway user",
    response.status === 201,
    `status=${response.status} user=${username}`,
  );

  await session.refreshCsrf();
  response = await session.request(
    "POST",
    "/api/register/",
    { username, password: "Other-pass-12345" },
    { csrf: true },
  );
  record(
    results,
    "duplicate username backend returns UI error message",
    response.status === 400 && response.text.includes("That username is already taken."),
    `status=${response.status} body=${response.text}`,
  );

  response = await session.request("GET", "/api/attempts/");
  record(
    results,
    "attempts data available for UI table",
    response.status === 200 && Array.isArray(response.json) && response.json.length >= 1,
    `status=${response.status} count=${Array.isArray(response.json) ? response.json.length : 0}`,
  );

  await session.refreshCsrf();
  response = await session.request("POST", "/api/logout/", {}, { csrf: true });
  record(results, "logout flow backend succeeds", response.status === 204, `status=${response.status}`);

  return formatResults(
    "C-UI",
    config,
    [
      `Target: ${target}`,
      `Web target: ${targets.webBase}`,
      `API target: ${targets.apiBase}`,
    ],
    results,
  );
}

export async function POST(request: NextRequest) {
  if (!isLocalRequest(request)) {
    return NextResponse.json(
      { detail: "Agent runner is local-only. Open the app from localhost to use it." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { agent?: string; target?: string }
    | null;
  const agent = body?.agent;
  if (!agent || !ALLOWED_AGENTS.has(agent)) {
    return NextResponse.json({ detail: "Unknown testing agent." }, { status: 400 });
  }
  const target = body?.target;
  if (!target || !ALLOWED_TARGETS.has(target)) {
    return NextResponse.json({ detail: "Unknown testing target." }, { status: 400 });
  }

  const repoRoot = resolve(process.cwd(), "..");
  const agentBasePath = resolve(repoRoot, "qa", "agents", agent);
  const configText = await readFile(`${agentBasePath}.json`, "utf8");
  const config = JSON.parse(configText) as AgentConfig;
  const targets = getTargets(target as TargetEnvironment, request);

  try {
    const output =
      agent === "C-API"
        ? await runApiTests(config, targets, target as TargetEnvironment)
        : await runUiTests(config, targets, target as TargetEnvironment);
    return NextResponse.json({ output });
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : "Could not run the local testing agent.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
