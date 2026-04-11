import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { loginSchema } from '../src/modules/auth/schemas.js';
import { createStudentSchema } from '../src/modules/master-data/schemas.js';
import { resolveAnomalySchema } from '../src/modules/classroom-ops/schemas.js';
import { createShippingFeeTemplateSchema } from '../src/modules/logistics/schemas.js';
import { walletTopUpSchema } from '../src/modules/memberships/schemas.js';

/**
 * API Contract Tests — Validation Error Behavior
 *
 * Verifies that Zod schemas produce structured, field-level errors suitable
 * for constructing API validation error envelopes. Tests confirm that:
 * - Invalid payloads are rejected
 * - Error objects identify which field failed
 * - Error messages are meaningful
 */

function parseAndExtractErrors(schema: z.ZodTypeAny, data: unknown): Record<string, string[]> {
  const result = schema.safeParse(data);
  if (result.success) return {};
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_root';
    if (!fieldErrors[key]) fieldErrors[key] = [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}

describe('loginSchema — validation error structure', () => {
  it('reports missing username error on the username field', () => {
    const errors = parseAndExtractErrors(loginSchema, { password: 'secret' });
    expect(errors['username']).toBeDefined();
    expect(errors['username'].length).toBeGreaterThan(0);
  });

  it('reports missing password error on the password field', () => {
    const errors = parseAndExtractErrors(loginSchema, { username: 'alice' });
    expect(errors['password']).toBeDefined();
  });

  it('returns empty errors for valid input', () => {
    const errors = parseAndExtractErrors(loginSchema, { username: 'alice', password: 'secure' });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

describe('createStudentSchema — validation error structure', () => {
  it('reports error on missing firstName', () => {
    const errors = parseAndExtractErrors(createStudentSchema, {
      studentNumber: 'STU-001',
      lastName: 'Doe',
    });
    expect(errors['firstName']).toBeDefined();
  });

  it('reports error on invalid email', () => {
    const errors = parseAndExtractErrors(createStudentSchema, {
      studentNumber: 'STU-001',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'bad-email',
    });
    expect(errors['email']).toBeDefined();
    expect(errors['email'][0]).toMatch(/email/i);
  });

  it('reports multiple errors when multiple fields are invalid', () => {
    const errors = parseAndExtractErrors(createStudentSchema, {});
    const errorCount = Object.keys(errors).length;
    expect(errorCount).toBeGreaterThan(1); // at least studentNumber, firstName, lastName
  });
});

describe('resolveAnomalySchema — empty resolutionNote produces field error', () => {
  it('reports resolutionNote field error when empty', () => {
    const errors = parseAndExtractErrors(resolveAnomalySchema, {
      anomalyEventId: '123e4567-e89b-12d3-a456-426614174000',
      resolutionNote: '',
    });
    expect(errors['resolutionNote']).toBeDefined();
  });

  it('ignores unknown anomalyEventId field and still validates resolutionNote', () => {
    const errors = parseAndExtractErrors(resolveAnomalySchema, {
      anomalyEventId: 'not-a-uuid',
      resolutionNote: 'Some note',
    });
    expect(errors['anomalyEventId']).toBeUndefined();
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

describe('createShippingFeeTemplateSchema — validation errors', () => {
  it('reports baseFee error when zero', () => {
    const errors = parseAndExtractErrors(createShippingFeeTemplateSchema, {
      name: 'Test',
      baseFee: 0,
      baseWeightLb: 2.0,
      perAdditionalLbFee: 1.25,
      regionCode: 'CONT_US',
      tier: 'standard',
    });
    expect(errors['baseFee']).toBeDefined();
  });

  it('reports tier error for unknown tier value', () => {
    const errors = parseAndExtractErrors(createShippingFeeTemplateSchema, {
      name: 'Test',
      baseFee: 5.00,
      baseWeightLb: 2.0,
      perAdditionalLbFee: 1.25,
      regionCode: 'CONT_US',
      tier: 'overnight',
    });
    expect(errors['tier']).toBeDefined();
  });
});

describe('walletTopUpSchema — validation errors', () => {
  it('reports amount error when zero', () => {
    const errors = parseAndExtractErrors(walletTopUpSchema, { amount: 0 });
    expect(errors['amount']).toBeDefined();
  });

  it('reports amount error when negative', () => {
    const errors = parseAndExtractErrors(walletTopUpSchema, { amount: -5 });
    expect(errors['amount']).toBeDefined();
  });

  it('reports amount error when missing', () => {
    const errors = parseAndExtractErrors(walletTopUpSchema, {});
    expect(errors['amount']).toBeDefined();
  });
});
