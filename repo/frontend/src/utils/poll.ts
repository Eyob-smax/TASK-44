import { ref, onUnmounted } from 'vue';

export interface PollOptions {
  /** Interval between fetches in milliseconds */
  interval: number;
  /** Whether to fetch immediately on start (default: true) */
  immediate?: boolean;
}

/**
 * Polling composable for LAN environments where SSE/WebSocket are not yet available.
 * Wraps a fetch function with configurable interval, start/stop controls, and reactive state.
 */
export function usePolling<T>(fetchFn: () => Promise<T>, options: PollOptions) {
  const data = ref<T | null>(null);
  const error = ref<Error | null>(null);
  const isLoading = ref(false);
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  async function execute() {
    if (stopped) return;
    isLoading.value = true;
    error.value = null;
    try {
      data.value = await fetchFn();
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
    } finally {
      isLoading.value = false;
    }
  }

  function scheduleNext() {
    if (stopped) return;
    timerId = setTimeout(async () => {
      await execute();
      scheduleNext();
    }, options.interval);
  }

  function start() {
    stopped = false;
    if (options.immediate !== false) {
      execute().then(scheduleNext);
    } else {
      scheduleNext();
    }
  }

  function stop() {
    stopped = true;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  onUnmounted(stop);

  return { data, error, isLoading, start, stop };
}
