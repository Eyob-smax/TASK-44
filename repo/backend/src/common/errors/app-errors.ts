export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: Record<string, string[]>;

  constructor(
    message: string,
    code: string,
    httpStatus: number,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: Record<string, string[]>) {
    super(message, 'NOT_FOUND', 404, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', details?: Record<string, string[]>) {
    super(message, 'CONFLICT', 409, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Not authenticated', details?: Record<string, string[]>) {
    super(message, 'UNAUTHORIZED', 401, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions', details?: Record<string, string[]>) {
    super(message, 'FORBIDDEN', 403, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: Record<string, string[]>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Request cannot be processed', details?: Record<string, string[]>) {
    super(message, 'UNPROCESSABLE', 422, details);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests', details?: Record<string, string[]>) {
    super(message, 'RATE_LIMITED', 429, details);
  }
}

export class CircuitOpenError extends AppError {
  constructor(message = 'Service temporarily unavailable', details?: Record<string, string[]>) {
    super(message, 'CIRCUIT_OPEN', 503, details);
  }
}

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred', details?: Record<string, string[]>) {
    super(message, 'INTERNAL_ERROR', 500, details);
  }
}
