import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { globalRateLimiter, loginRateLimiter } from '../src/common/middleware/rate-limiter.js';

describe('rate-limiter middleware', () => {
  it('globalRateLimiter eventually emits RATE_LIMITED envelope', async () => {
    const app = express();
    app.use(globalRateLimiter);
    app.get('/g', (_req, res) => res.status(200).json({ success: true }));

    let rateLimited = false;
    for (let i = 0; i < 150; i += 1) {
      const res = await request(app).get('/g');
      if (res.status === 429) {
        rateLimited = true;
        expect(res.body.success).toBe(false);
        expect(res.body.error?.code).toBe('RATE_LIMITED');
        break;
      }
    }

    expect(rateLimited).toBe(true);
  });

  it('loginRateLimiter eventually emits RATE_LIMITED envelope', async () => {
    const app = express();
    app.use(loginRateLimiter);
    app.post('/login', (_req, res) => res.status(200).json({ success: true }));

    let rateLimited = false;
    for (let i = 0; i < 20; i += 1) {
      const res = await request(app).post('/login');
      if (res.status === 429) {
        rateLimited = true;
        expect(res.body.success).toBe(false);
        expect(res.body.error?.code).toBe('RATE_LIMITED');
        break;
      }
    }

    expect(rateLimited).toBe(true);
  });
});
