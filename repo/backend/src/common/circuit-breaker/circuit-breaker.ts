import { CircuitOpenError } from '../errors/app-errors.js';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  openTimeoutMs: number;
}

export class CircuitBreaker {
  readonly name: string;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly openTimeoutMs: number;

  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureAt: Date | null = null;
  private openedAt: Date | null = null;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold;
    this.successThreshold = options.successThreshold;
    this.openTimeoutMs = options.openTimeoutMs;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.openedAt && Date.now() - this.openedAt.getTime() >= this.openTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new CircuitOpenError(`Circuit breaker open: ${this.name}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.openedAt = null;
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.lastFailureAt = new Date();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.openedAt = new Date();
      return;
    }

    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = new Date();
    }
  }

  getState(): {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureAt: Date | null;
    openedAt: Date | null;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureAt: this.lastFailureAt,
      openedAt: this.openedAt,
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureAt = null;
    this.openedAt = null;
  }
}

export const circuitBreakerRegistry = new Map<string, CircuitBreaker>();

export function getOrCreateBreaker(
  name: string,
  options: Omit<CircuitBreakerOptions, 'name'>,
): CircuitBreaker {
  const existing = circuitBreakerRegistry.get(name);
  if (existing) return existing;

  const breaker = new CircuitBreaker({ name, ...options });
  circuitBreakerRegistry.set(name, breaker);
  return breaker;
}
