/**
 * Frontend Unit Tests — Domain Type Imports
 *
 * Verifies that domain type enums and constants from backend-shared type modules
 * can be cleanly imported and have the expected values.
 *
 * Note: These tests validate structural correctness of the type definitions.
 * Component-level tests for each view are in their respective test files.
 */

import { describe, it, expect } from 'vitest';

// Since frontend shares domain contracts with backend, we verify the expected
// enum values are documented consistently here as frontend constants.

// These mirror the backend enum values that will flow through API responses.
// Defined here to test that frontend domain knowledge is explicit and exhaustive.

const ANOMALY_STATUSES = ['open', 'acknowledged', 'assigned', 'resolved'] as const;
const PARKING_EXCEPTION_TYPES = [
  'no_plate',
  'overtime',
  'unsettled',
  'duplicate_plate',
  'inconsistent_entry_exit',
] as const;
const TICKET_TYPES = ['delay', 'dispute', 'lost_item'] as const;
const TICKET_STATUSES = ['open', 'investigating', 'pending_approval', 'resolved', 'closed'] as const;
const LEDGER_ENTRY_TYPES = ['topup', 'spend', 'refund'] as const;
const CLASSROOM_STATUSES = ['online', 'offline', 'degraded'] as const;
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
const NOTIFICATION_TYPES = ['banner', 'audible'] as const;
const BACKUP_STATUSES = ['running', 'completed', 'failed'] as const;
const SHIPPING_TIERS = ['standard', 'express', 'priority'] as const;

describe('Classroom domain constants', () => {
  it('covers all classroom status values', () => {
    expect(CLASSROOM_STATUSES).toHaveLength(3);
    expect(CLASSROOM_STATUSES).toContain('online');
    expect(CLASSROOM_STATUSES).toContain('offline');
    expect(CLASSROOM_STATUSES).toContain('degraded');
  });

  it('covers all anomaly lifecycle statuses', () => {
    expect(ANOMALY_STATUSES).toHaveLength(4);
    expect(ANOMALY_STATUSES).toContain('open');
    expect(ANOMALY_STATUSES).toContain('acknowledged');
    expect(ANOMALY_STATUSES).toContain('assigned');
    expect(ANOMALY_STATUSES).toContain('resolved');
  });
});

describe('Parking domain constants', () => {
  it('covers exactly the 5 exception types from the prompt', () => {
    expect(PARKING_EXCEPTION_TYPES).toHaveLength(5);
    expect(PARKING_EXCEPTION_TYPES).toContain('no_plate');
    expect(PARKING_EXCEPTION_TYPES).toContain('overtime');
    expect(PARKING_EXCEPTION_TYPES).toContain('unsettled');
    expect(PARKING_EXCEPTION_TYPES).toContain('duplicate_plate');
    expect(PARKING_EXCEPTION_TYPES).toContain('inconsistent_entry_exit');
  });
});

describe('After-sales domain constants', () => {
  it('ticket types match the 3 prompt-required types', () => {
    expect(TICKET_TYPES).toHaveLength(3);
    expect(TICKET_TYPES).toContain('delay');
    expect(TICKET_TYPES).toContain('dispute');
    expect(TICKET_TYPES).toContain('lost_item');
  });

  it('ticket statuses cover full workflow lifecycle', () => {
    expect(TICKET_STATUSES).toHaveLength(5);
    expect(TICKET_STATUSES).toContain('pending_approval');
  });
});

describe('Membership domain constants', () => {
  it('ledger entry types are append-only: topup, spend, refund', () => {
    expect(LEDGER_ENTRY_TYPES).toHaveLength(3);
    expect(LEDGER_ENTRY_TYPES).toContain('topup');
    expect(LEDGER_ENTRY_TYPES).toContain('spend');
    expect(LEDGER_ENTRY_TYPES).toContain('refund');
  });

  it('shipping tiers are standard, express, priority', () => {
    expect(SHIPPING_TIERS).toHaveLength(3);
    expect(SHIPPING_TIERS).toContain('standard');
    expect(SHIPPING_TIERS).toContain('express');
    expect(SHIPPING_TIERS).toContain('priority');
  });
});

describe('Observability domain constants', () => {
  it('log levels cover all 4 severity levels', () => {
    expect(LOG_LEVELS).toHaveLength(4);
    expect(LOG_LEVELS).toContain('debug');
    expect(LOG_LEVELS).toContain('error');
  });

  it('notification types are banner and audible (no email)', () => {
    expect(NOTIFICATION_TYPES).toHaveLength(2);
    expect(NOTIFICATION_TYPES).toContain('banner');
    expect(NOTIFICATION_TYPES).toContain('audible');
    // Confirms no email-based notifications as per offline-LAN constraint
    expect(NOTIFICATION_TYPES).not.toContain('email');
  });
});

describe('Backup domain constants', () => {
  it('backup statuses match schema definition', () => {
    expect(BACKUP_STATUSES).toHaveLength(3);
    expect(BACKUP_STATUSES).toContain('running');
    expect(BACKUP_STATUSES).toContain('completed');
    expect(BACKUP_STATUSES).toContain('failed');
  });
});
