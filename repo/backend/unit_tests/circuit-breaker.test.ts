import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  circuitBreakerRegistry,
  getOrCreateBreaker,
} from '../src/common/circuit-breaker/circuit-breaker.js';
import { CircuitOpenError } from '../src/common/errors/app-errors.js';

const defaultOptions = {
  failureThreshold: 3,
  successThreshold: 1,
  openTimeoutMs: 1000,
};

function makeBreaker(overrides: Partial<typeof defaultOptions> = {}): CircuitBreaker {
  return new CircuitBreaker({ name: 'test', ...defaultOptions, ...overrides });
}

const succeed = () => Promise.resolve('ok');
const fail = () => Promise.reject(new Error('downstream error'));

describe('CircuitBreaker — initial state', () => {
  it('starts in CLOSED state', () => {
    const cb = makeBreaker();
    expect(cb.getState().state).toBe('CLOSED');
  });
});

describe('CircuitBreaker — CLOSED state', () => {
  it('failures below threshold keep state CLOSED', async () => {
    const cb = makeBreaker({ failureThreshold: 3 });
    await cb.execute(fail).catch(() => {});
    await cb.execute(fail).catch(() => {});
    expect(cb.getState().state).toBe('CLOSED');
    expect(cb.getState().failureCount).toBe(2);
  });

  it('failures at threshold transition to OPEN', async () => {
    const cb = makeBreaker({ failureThreshold: 3 });
    await cb.execute(fail).catch(() => {});
    await cb.execute(fail).catch(() => {});
    await cb.execute(fail).catch(() => {});
    expect(cb.getState().state).toBe('OPEN');
  });

  it('success in CLOSED resets failure count', async () => {
    const cb = makeBreaker({ failureThreshold: 3 });
    await cb.execute(fail).catch(() => {});
    await cb.execute(succeed);
    expect(cb.getState().failureCount).toBe(0);
    expect(cb.getState().state).toBe('CLOSED');
  });
});

describe('CircuitBreaker — OPEN state', () => {
  it('rejects immediately with CircuitOpenError when OPEN', async () => {
    const cb = makeBreaker({ failureThreshold: 1 });
    await cb.execute(fail).catch(() => {});
    await expect(cb.execute(succeed)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('transitions to HALF_OPEN after openTimeoutMs', async () => {
    vi.useFakeTimers();
    const cb = makeBreaker({ failureThreshold: 1, openTimeoutMs: 500 });
    await cb.execute(fail).catch(() => {});
    expect(cb.getState().state).toBe('OPEN');

    vi.advanceTimersByTime(501);
    // Next execute call checks the timeout
    await cb.execute(succeed);
    expect(cb.getState().state).toBe('CLOSED');
    vi.useRealTimers();
  });
});

describe('CircuitBreaker — HALF_OPEN state', () => {
  async function openThenAdvance(): Promise<CircuitBreaker> {
    vi.useFakeTimers();
    const cb = makeBreaker({ failureThreshold: 1, openTimeoutMs: 500, successThreshold: 1 });
    await cb.execute(fail).catch(() => {});
    vi.advanceTimersByTime(501);
    return cb;
  }

  it('success in HALF_OPEN transitions to CLOSED', async () => {
    const cb = await openThenAdvance();
    await cb.execute(succeed);
    expect(cb.getState().state).toBe('CLOSED');
    vi.useRealTimers();
  });

  it('failure in HALF_OPEN transitions back to OPEN', async () => {
    const cb = await openThenAdvance();
    await cb.execute(fail).catch(() => {});
    expect(cb.getState().state).toBe('OPEN');
    vi.useRealTimers();
  });
});

describe('CircuitBreaker — reset()', () => {
  it('force-transitions to CLOSED', async () => {
    const cb = makeBreaker({ failureThreshold: 1 });
    await cb.execute(fail).catch(() => {});
    expect(cb.getState().state).toBe('OPEN');
    cb.reset();
    expect(cb.getState().state).toBe('CLOSED');
    expect(cb.getState().failureCount).toBe(0);
  });
});

describe('circuitBreakerRegistry / getOrCreateBreaker', () => {
  beforeEach(() => circuitBreakerRegistry.clear());

  it('creates a new breaker and stores it in registry', () => {
    const cb = getOrCreateBreaker('connector-a', defaultOptions);
    expect(cb).toBeInstanceOf(CircuitBreaker);
    expect(circuitBreakerRegistry.has('connector-a')).toBe(true);
  });

  it('returns the same instance on subsequent calls', () => {
    const cb1 = getOrCreateBreaker('connector-b', defaultOptions);
    const cb2 = getOrCreateBreaker('connector-b', defaultOptions);
    expect(cb1).toBe(cb2);
  });
});
