import { getApiBaseUrl } from './config';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type ApiJsonOptions = RequestInit & {
  token?: string | null;
};

export async function apiJson<T>(
  path: string,
  options: ApiJsonOptions = {},
): Promise<T> {
  const { token, headers, ...init } = options;
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });

  const raw = await res.text();
  if (!res.ok) {
    try {
      const parsed = JSON.parse(raw) as { message?: string | string[] };
      const msg = parsed.message;
      if (typeof msg === 'string') {
        throw new ApiError(msg, res.status);
      }
      if (Array.isArray(msg) && msg.length > 0) {
        throw new ApiError(msg.join(' · '), res.status);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
    }
    throw new ApiError(raw || `Request failed (${res.status})`, res.status);
  }

  if (!raw) {
    return {} as T;
  }

  const body = JSON.parse(raw) as T | { data: T };
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data;
  }
  return body as T;
}
