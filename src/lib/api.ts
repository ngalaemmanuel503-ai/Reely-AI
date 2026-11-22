let memoryToken: string | null = null;

export function setAuthToken(token: string | null) {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken;
}

export class ApiError extends Error {
  status: number;
  errorKey: string;
  data: Record<string, unknown>;

  constructor(status: number, errorKey: string, data: Record<string, unknown> = {}) {
    super(errorKey);
    this.status = status;
    this.errorKey = errorKey;
    this.data = data;
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'ReelyAI');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof parsed.errorKey === 'string' ? parsed.errorKey : 'auth.errorGeneric',
      parsed
    );
  }

  return parsed as T;
}
