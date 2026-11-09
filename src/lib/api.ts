import { describeApiError } from "./apiErrors";

// Client for the PO Bunker API (backend/). The access token lives in memory
// only; the refresh token is an httpOnly cookie the browser sends to
// /api/v1/auth by itself. A 401 triggers one refresh and one retry.

const BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? ""
).replace(/\/$/, "");
const PREFIX = `${BASE}/api/v1`;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;
  /** Seconds to wait, from a Retry-After header (rate limits). */
  readonly retryAfter?: number;

  constructor(
    status: number,
    code: string,
    serverMessage: string,
    field?: string,
    retryAfter?: number,
  ) {
    super(describeApiError(code, field, serverMessage));
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
    this.retryAfter = retryAfter;
  }
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "staff" | "viewer";
}

export interface ApiSession {
  access_token: string;
  expires_in: number;
  user: ApiUser;
}

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/** Called when the session cannot be renewed (the user must sign in again). */
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

/** Makes an API-relative URL such as /api/v1/files/... usable from the browser. */
export const apiUrl = (path: string): string =>
  path.startsWith("http") ? path : `${BASE}${path}`;

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  form?: FormData;
  /** false for login/refresh: no Authorization header, no refresh-and-retry. */
  auth?: boolean;
}

const credentials: RequestCredentials = BASE ? "include" : "same-origin";

const toApiError = async (res: Response): Promise<ApiError> => {
  let code = "internal_error";
  let message = res.statusText;
  let field: string | undefined;
  try {
    const body = await res.json();
    if (body?.error) {
      code = String(body.error.code ?? code);
      message = String(body.error.message ?? message);
      field = body.error.field;
    }
  } catch {
    // not JSON (a proxy error page, for example)
  }
  const retry = Number(res.headers.get("Retry-After"));
  return new ApiError(res.status, code, message, field, retry > 0 ? retry : undefined);
};

const send = async (
  method: string,
  path: string,
  opts: RequestOptions,
): Promise<Response> => {
  let url = `${PREFIX}${path}`;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form; // the browser sets the multipart boundary
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (opts.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  try {
    return await fetch(url, { method, headers, body, credentials });
  } catch {
    throw new ApiError(0, "network_error", "Network error");
  }
};

// One refresh at a time: several requests (or React StrictMode's double
// effects) that hit a 401 together share a single call, which matters because
// the refresh token rotates on every use.
let refreshing: Promise<ApiSession | null> | null = null;

export const refreshSession = (): Promise<ApiSession | null> => {
  refreshing ??= (async () => {
    try {
      const res = await send("POST", "/auth/refresh", { auth: false });
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const session = (await res.json()) as ApiSession;
      accessToken = session.access_token;
      return session;
    } finally {
      // keep the settled promise for this tick so concurrent callers share it
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
};

async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  let res = await send(method, path, opts);

  if (res.status === 401 && opts.auth !== false) {
    const session = await refreshSession();
    if (session) {
      res = await send(method, path, opts);
    } else {
      onUnauthorized?.();
    }
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) =>
    request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, auth?: boolean) =>
    request<T>("POST", path, { body, auth }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(method: "POST" | "PUT", path: string, file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return request<T>(method, path, { form });
  },
};
