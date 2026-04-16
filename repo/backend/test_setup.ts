import { afterAll } from 'vitest';

// Ensure Prisma engine handles are closed so Vitest workers can exit cleanly.
// Use a dynamic import so that unit tests (which mock the container) don't
// fail during setup when the Prisma client has not been generated yet.
afterAll(async () => {
  try {
    const { db } = await import('./src/app/container.js');
    await db.$disconnect();
  } catch {
    // Best effort shutdown for tests that fully mock the DB container.
  }
});
