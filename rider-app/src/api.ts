import { API_URL } from "./config";
import { createSession, type RefreshResult, type Tokens } from "./lib/session";
import { secureTokenStore } from "./storage";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const signedOutListeners = new Set<() => void>();
export function onSignedOut(listener: () => void): () => void {
  signedOutListeners.add(listener);
  return () => signedOutListeners.delete(listener);
}

async function doRefresh(refreshToken: string): Promise<RefreshResult> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (res.status === 401 || res.status === 403)
      return { ok: false, reason: "rejected" };
    if (!res.ok) return { ok: false, reason: "network" };
    const json = (await res.json()) as Partial<Tokens>;
    return json.accessToken && json.refreshToken
      ? {
          ok: true,
          tokens: {
            accessToken: json.accessToken,
            refreshToken: json.refreshToken,
          },
        }
      : { ok: false, reason: "network" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

const session = createSession({
  store: secureTokenStore,
  refresh: doRefresh,
  onSignedOut: () => signedOutListeners.forEach((listener) => listener()),
});

export const setTokens = (tokens: Tokens) => session.setTokens(tokens);
export const clearTokens = () => session.clear();
export const readTokens = () => session.readTokens();

type Method = "GET" | "POST" | "PATCH" | "PUT";

async function send(
  path: string,
  method: Method,
  body: RequestInit["body"],
  extra: Record<string, string>,
  token: string | null,
) {
  const headers: Record<string, string> = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetchWithTimeout(`${API_URL}${path}`, { method, headers, body });
}

async function call<T>(
  path: string,
  method: Method,
  body: RequestInit["body"],
  extra: Record<string, string>,
): Promise<T> {
  const token = await session.getAccessToken();
  let res: Response;
  try {
    res = await send(path, method, body, extra, token);
    // The access token expired: renew it once and repeat the request
    if (res.status === 401 && token) {
      const renewed = await session.renew(token);
      if (renewed) res = await send(path, method, body, extra, renewed);
    }
  } catch {
    throw new ApiError(
      0,
      "NETWORK",
      `Cannot reach the server at ${API_URL}. Check your internet connection and that the server is running.`,
    );
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (
      data as { error?: { code?: string; message?: string } } | null
    )?.error;
    throw new ApiError(
      res.status,
      error?.code ?? "ERROR",
      error?.message ?? "Something went wrong. Please try again.",
    );
  }
  return data as T;
}

export function api<T>(
  path: string,
  options: { method?: Method; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const extra: Record<string, string> = {};
  if (method !== "GET") extra["Content-Type"] = "application/json";
  if (options.idempotencyKey) extra["Idempotency-Key"] = options.idempotencyKey;
  // The API rejects a JSON request with an empty body, so write requests always send one
  return call<T>(
    path,
    method,
    method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
    extra,
  );
}

// Photos go up as a form. The content type is left to the phone, which adds the boundary the server needs.
export function apiUpload<T>(path: string, form: FormData): Promise<T> {
  return call<T>(path, "POST", form, {});
}
