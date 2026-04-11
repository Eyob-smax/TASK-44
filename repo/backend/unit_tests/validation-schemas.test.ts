import { describe, it, expect } from 'vitest';
import { loginSchema } from '../src/modules/auth/schemas.js';
import { createStudentSchema, createSemesterSchema } from '../src/modules/master-data/schemas.js';
import { resolveAnomalySchema } from '../src/modules/classroom-ops/schemas.js';
import { resolveExceptionSchema } from '../src/modules/parking/schemas.js';
import { createShippingFeeTemplateSchema, addNonServiceableZipSchema } from '../src/modules/logistics/schemas.js';
import { createTicketSchema } from '../src/modules/after-sales/schemas.js';
import { walletTopUpSchema, walletSpendSchema, createCouponSchema } from '../src/modules/memberships/schemas.js';
import { createAlertThresholdSchema } from '../src/modules/observability/schemas.js';
import { MAX_UPLOAD_SIZE_BYTES, fileUploadMetadataSchema } from '../src/common/validation/schemas.js';

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    expect(() => loginSchema.parse({ username: 'alice', password: 'secret123' })).not.toThrow();
  });

  it('rejects empty username', () => {
    expect(() => loginSchema.parse({ username: '', password: 'secret' })).toThrow();
  });

  it('rejects missing password', () => {
    expect(() => loginSchema.parse({ username: 'alice' })).toThrow();
  });
});

describe('createStudentSchema', () => {
  it('accepts valid student data', () => {
    expect(() =>
      createStudentSchema.parse({ studentNumber: 'STU-001', firstName: 'Jane', lastName: 'Doe' })
    ).not.toThrow();
  });

  it('accepts optional email', () => {
    expect(() =>
      createStudentSchema.parse({
        studentNumber: 'STU-002',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@school.edu',
      })
    ).not.toThrow();
  });

  it('rejects invalid email format', () => {
    expect(() =>
      createStudentSchema.parse({
        studentNumber: 'STU-003',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'not-an-email',
      })
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => createStudentSchema.parse({ studentNumber: 'STU-004' })).toThrow();
  });
});

describe('createSemesterSchema', () => {
  it('accepts valid semester dates', () => {
    expect(() =>
      createSemesterSchema.parse({ name: 'Fall 2026', startDate: '2026-08-25', endDate: '2026-12-15' })
    ).not.toThrow();
  });

  it('rejects endDate before startDate', () => {
    expect(() =>
      createSemesterSchema.parse({ name: 'Bad Semester', startDate: '2026-12-01', endDate: '2026-08-01' })
    ).toThrow();
  });

  it('rejects invalid date format', () => {
    expect(() =>
      createSemesterSchema.parse({ name: 'Bad Dates', startDate: '25/08/2026', endDate: '15/12/2026' })
    ).toThrow();
  });
});

describe('resolveAnomalySchema', () => {
  it('accepts a valid resolution with non-empty note', () => {
    expect(() =>
      resolveAnomalySchema.parse({
        anomalyEventId: '123e4567-e89b-12d3-a456-426614174000',
        resolutionNote: 'Investigated and resolved the issue.',
      })
    ).not.toThrow();
  });

  it('rejects empty resolutionNote', () => {
    expect(() =>
      resolveAnomalySchema.parse({
        anomalyEventId: '123e4567-e89b-12d3-a456-426614174000',
        resolutionNote: '',
      })
    ).toThrow();
  });

  it('rejects missing resolutionNote', () => {
    expect(() =>
      resolveAnomalySchema.parse({ anomalyEventId: '123e4567-e89b-12d3-a456-426614174000' })
    ).toThrow();
  });
});

describe('resolveExceptionSchema (parking)', () => {
  it('accepts valid resolution note', () => {
    expect(() =>
      resolveExceptionSchema.parse({ resolutionNote: 'Operator manually verified plate.' })
    ).not.toThrow();
  });

  it('rejects empty resolution note', () => {
    expect(() => resolveExceptionSchema.parse({ resolutionNote: '' })).toThrow();
  });
});

describe('createShippingFeeTemplateSchema', () => {
  it('accepts valid template data', () => {
    expect(() =>
      createShippingFeeTemplateSchema.parse({
        name: 'Standard Continental US',
        baseFee: 6.95,
        baseWeightLb: 2.0,
        perAdditionalLbFee: 1.25,
        regionCode: 'CONT_US',
        tier: 'standard',
      })
    ).not.toThrow();
  });

  it('rejects baseFee of zero', () => {
    expect(() =>
      createShippingFeeTemplateSchema.parse({
        name: 'Zero Template',
        baseFee: 0,
        baseWeightLb: 2.0,
        perAdditionalLbFee: 1.25,
        regionCode: 'CONT_US',
        tier: 'standard',
      })
    ).toThrow();
  });

  it('rejects negative weight', () => {
    expect(() =>
      createShippingFeeTemplateSchema.parse({
        name: 'Negative Template',
        baseFee: 5.00,
        baseWeightLb: -1.0,
        perAdditionalLbFee: 1.25,
        regionCode: 'CONT_US',
        tier: 'standard',
      })
    ).toThrow();
  });

  it('rejects invalid tier', () => {
    expect(() =>
      createShippingFeeTemplateSchema.parse({
        name: 'Bad Tier',
        baseFee: 5.00,
        baseWeightLb: 2.0,
        perAdditionalLbFee: 1.25,
        regionCode: 'CONT_US',
        tier: 'overnight', // not in enum
      })
    ).toThrow();
  });
});

describe('addNonServiceableZipSchema', () => {
  it('accepts valid 5-digit ZIP', () => {
    expect(() => addNonServiceableZipSchema.parse({ zipCode: '90210' })).not.toThrow();
  });

  it('rejects 4-digit ZIP', () => {
    expect(() => addNonServiceableZipSchema.parse({ zipCode: '9021' })).toThrow();
  });

  it('rejects 6-digit ZIP', () => {
    expect(() => addNonServiceableZipSchema.parse({ zipCode: '902100' })).toThrow();
  });

  it('rejects alphanumeric ZIP', () => {
    expect(() => addNonServiceableZipSchema.parse({ zipCode: 'ABCDE' })).toThrow();
  });
});

describe('walletTopUpSchema', () => {
  it('accepts positive amount', () => {
    expect(() => walletTopUpSchema.parse({ amount: 25.00 })).not.toThrow();
  });

  it('rejects zero amount', () => {
    expect(() => walletTopUpSchema.parse({ amount: 0 })).toThrow();
  });

  it('rejects negative amount', () => {
    expect(() => walletTopUpSchema.parse({ amount: -10 })).toThrow();
  });
});

describe('walletSpendSchema', () => {
  it('accepts positive spend amount', () => {
    expect(() =>
      walletSpendSchema.parse({ amount: 10.00, referenceType: 'fulfillment_request' })
    ).not.toThrow();
  });

  it('rejects zero amount', () => {
    expect(() => walletSpendSchema.parse({ amount: 0 })).toThrow();
  });
});

describe('createCouponSchema', () => {
  it('accepts valid coupon', () => {
    expect(() =>
      createCouponSchema.parse({ code: 'SAVE20', discountType: 'percentage', discountValue: 20.0 })
    ).not.toThrow();
  });

  it('rejects lowercase coupon code', () => {
    expect(() =>
      createCouponSchema.parse({ code: 'save20', discountType: 'percentage', discountValue: 20.0 })
    ).toThrow();
  });

  it('rejects zero discount value', () => {
    expect(() =>
      createCouponSchema.parse({ code: 'ZERO', discountType: 'fixed_amount', discountValue: 0 })
    ).toThrow();
  });
});

describe('fileUploadMetadataSchema', () => {
  it('accepts valid JPEG file under limit', () => {
    expect(() =>
      fileUploadMetadataSchema.parse({
        originalName: 'evidence.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 5 * 1024 * 1024,
      })
    ).not.toThrow();
  });

  it('accepts PNG file', () => {
    expect(() =>
      fileUploadMetadataSchema.parse({
        originalName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      })
    ).not.toThrow();
  });

  it('rejects files exceeding 10 MB', () => {
    expect(() =>
      fileUploadMetadataSchema.parse({
        originalName: 'large.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: MAX_UPLOAD_SIZE_BYTES + 1,
      })
    ).toThrow();
  });

  it('rejects non-image MIME types (PDF)', () => {
    expect(() =>
      fileUploadMetadataSchema.parse({
        originalName: 'document.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      })
    ).toThrow();
  });

  it('rejects GIF files', () => {
    expect(() =>
      fileUploadMetadataSchema.parse({
        originalName: 'animation.gif',
        mimeType: 'image/gif',
        sizeBytes: 1024,
      })
    ).toThrow();
  });

  it('rejects zero-size files', () => {
    expect(() =>
      fileUploadMetadataSchema.parse({
        originalName: 'empty.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 0,
      })
    ).toThrow();
  });
});

describe('createAlertThresholdSchema', () => {
  it('accepts valid threshold', () => {
    expect(() =>
      createAlertThresholdSchema.parse({ metricName: 'p95_latency', operator: 'gt', thresholdValue: 500 })
    ).not.toThrow();
  });

  it('rejects invalid operator', () => {
    expect(() =>
      createAlertThresholdSchema.parse({ metricName: 'cpu', operator: 'neq', thresholdValue: 90 })
    ).toThrow();
  });

  it('rejects empty metricName', () => {
    expect(() =>
      createAlertThresholdSchema.parse({ metricName: '', operator: 'gt', thresholdValue: 10 })
    ).toThrow();
  });
});
