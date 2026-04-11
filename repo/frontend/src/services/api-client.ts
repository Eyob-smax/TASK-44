import axios, { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { ApiError } from './types.js';

let tokenGetter: (() => string | null) | null = null;

/**
 * Register a token getter so the client can inject Authorization headers.
 * Called once during app bootstrap after Pinia is initialized.
 */
export function registerTokenGetter(getter: () => string | null) {
  tokenGetter = getter;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ---- Request interceptor: inject Bearer token ----
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenGetter?.();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Response interceptor: normalize errors to ApiError ----
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (err) => {
    if (err.response) {
      const { data, status } = err.response as { data: any; status: number };
      const errorBody = data?.error ?? {};
      const code =
        errorBody.code ??
        (status === 401
          ? 'UNAUTHORIZED'
          : status === 403
            ? 'FORBIDDEN'
            : status === 404
              ? 'NOT_FOUND'
              : status === 409
                ? 'CONFLICT'
                : status === 422
                  ? 'UNPROCESSABLE'
                  : status === 429
                    ? 'RATE_LIMITED'
                    : 'INTERNAL_ERROR');
      const message = errorBody.message ?? err.message ?? 'An unexpected error occurred';
      throw new ApiError(code, message, errorBody.details);
    }
    // Network / timeout errors
    throw new ApiError('INTERNAL_ERROR', err.message ?? 'Network error');
  },
);

/**
 * Unwraps a backend SuccessEnvelope response to its data payload.
 */
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await apiClient.get<{ data: T }>(url, { params });
  return res.data.data;
}

export async function post<T>(
  url: string,
  body?: unknown,
  options?: { headers?: Record<string, string> },
): Promise<T> {
  const res = await apiClient.post<{ data: T }>(url, body, options);
  return res.data.data;
}

export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiClient.patch<{ data: T }>(url, body);
  return res.data.data;
}

export async function del<T>(url: string): Promise<T> {
  const res = await apiClient.delete<{ data: T }>(url);
  return res.data.data;
}
