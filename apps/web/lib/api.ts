// The only place the browser talks to the API. It adds the login token,
// sends/reads JSON, and turns every error into an ApiError with the API's
// { statusCode, code, message } (PRD §11).

// NEXT_PUBLIC_ variables are copied into the browser code at build time, so this
// is public: only ever the API's address, never a secret.
// `||`, not `??`: an unset build argument arrives as an empty string.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// The token lives in localStorage so it survives a page refresh. Trade-off: any
// script running on our page (e.g. injected through an XSS bug) could read it.
// In production an httpOnly cookie is safer, because page scripts can't read it.
const TOKEN_KEY = 'teslapool.token';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // fetch only throws when there is no answer at all (API down, no network).
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      "Can't reach the server. Please try again in a moment.",
    );
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // Our token expired or is invalid: start again from the login page.
    if (response.status === 401 && token) {
      clearToken();
      window.location.assign('/login');
    }
    const error = data as { code?: string; message?: string } | null;
    throw new ApiError(
      response.status,
      error?.code ?? 'ERROR',
      error?.message ?? 'Something went wrong',
    );
  }
  return data as T;
}

// A message that is safe to show for anything a try/catch caught.
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}
