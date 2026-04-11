import { afterAll } from 'vitest';
import { db } from './src/app/container.js';

// Ensure Prisma engine handles are closed so Vitest workers can exit cleanly.
afterAll(async () => {
  try {
    await db.$disconnect();
  } catch {
    // Best effort shutdown for tests that fully mock the DB container.
  }
});
