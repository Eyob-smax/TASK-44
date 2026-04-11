// API error types — consumed by the Axios client and UI error handlers.
// No runtime coupling to Axios, Pinia, or router in this file.

export const ApiErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE: 'UNPROCESSABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCodeValue = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export class ApiError extends Error {
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

// ---- Auth types (mirrors backend auth/types.ts) ----

export interface UserResponse {
  id: string;
  username: string;
  displayName: string;
  orgId?: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: { id: string; name: string }[];
  createdAt: string;
}

export interface AuthSessionResponse {
  user: UserResponse;
  permissions: string[];
  token: string;
}

// ---- Shared envelope ----

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}
