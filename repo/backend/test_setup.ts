import { afterAll } from 'vitest';

// Ensure Prisma engine handles are closed so Vitest workers can exit cleanly.
// Use a dynamic import so that unit tests (which mock the container) don't
// fail during setup when the Prisma client has not been generated yet.
afterAll(async () => {
  try {
    const disconnectTimeoutMs = 3000;
    const container = await Promise.race([
      import('./src/app/container.js'),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), disconnectTimeoutMs);
      }),
    ]);

    if (!container) {
      return;
    }

    await Promise.race([
      container.db.$disconnect(),
      new Promise<void>((resolve) => {
        setTimeout(() => resolve(), disconnectTimeoutMs);
      }),
    ]);
  } catch {
    // Best effort shutdown for tests that fully mock the DB container.
  }
});
