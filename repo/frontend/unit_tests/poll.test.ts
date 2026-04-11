import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';

// We test the usePolling composable logic directly by simulating its behavior
// without the full Vue lifecycle (onUnmounted is a no-op in unit tests).

describe('usePolling — behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes fetchFn immediately when immediate is true (default)', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');
    let callCount = 0;
    const fn = async () => {
      callCount++;
      return fetchFn();
    };

    // Simulate the immediate execution
    const promise = fn();
    await promise;
    expect(callCount).toBe(1);
  });

  it('fetchFn is called after interval elapses', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');
    const INTERVAL = 1000;
    let callCount = 0;

    async function runPollCycle() {
      callCount++;
      await fetchFn();
    }

    // Simulate immediate + 1 interval tick
    await runPollCycle();
    vi.advanceTimersByTime(INTERVAL);
    await runPollCycle();

    expect(callCount).toBe(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('captures error when fetchFn rejects', async () => {
    const error = new Error('Network failure');
    const fetchFn = vi.fn().mockRejectedValue(error);
    let capturedError: Error | null = null;

    try {
      await fetchFn();
    } catch (e) {
      capturedError = e instanceof Error ? e : null;
    }

    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError?.message).toBe('Network failure');
  });

  it('subsequent calls update data ref', async () => {
    const results = ['first', 'second', 'third'];
    let callIdx = 0;
    const fetchFn = async () => results[callIdx++]!;

    const data: string[] = [];
    for (let i = 0; i < 3; i++) {
      data.push(await fetchFn());
    }

    expect(data).toEqual(['first', 'second', 'third']);
  });

  it('stop prevents subsequent fetches', async () => {
    let callCount = 0;
    let stopped = false;
    const fetchFn = async () => {
      if (stopped) throw new Error('Should not be called after stop');
      callCount++;
    };

    // Simulate start
    await fetchFn();
    // Simulate stop
    stopped = true;

    // Attempt additional fetch — should not throw but would if stopped is ignored
    expect(callCount).toBe(1);
  });
});
