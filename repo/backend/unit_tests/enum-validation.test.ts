import { describe, it, expect } from 'vitest';
import { AnomalyStatus, AnomalySeverity, AnomalyType } from '../src/modules/classroom-ops/types.js';
import { ParkingExceptionType, ParkingExceptionStatus, ParkingReaderType } from '../src/modules/parking/types.js';
import { TicketType, TicketStatus, TicketPriority, CompensationDecision, CompensationSuggestionStatus } from '../src/modules/after-sales/types.js';
import { LedgerEntryType, DiscountType, FulfillmentRequestStatus } from '../src/modules/memberships/types.js';
import { LogLevel, AlertOperator, NotificationType } from '../src/modules/observability/types.js';
import { BackupStatus, RestoreStatus } from '../src/modules/backups/types.js';

describe('Classroom Ops Enums', () => {
  it('AnomalyStatus has required values', () => {
    expect(Object.values(AnomalyStatus)).toContain('open');
    expect(Object.values(AnomalyStatus)).toContain('acknowledged');
    expect(Object.values(AnomalyStatus)).toContain('assigned');
    expect(Object.values(AnomalyStatus)).toContain('resolved');
  });

  it('AnomalySeverity has required values', () => {
    const values = Object.values(AnomalySeverity);
    expect(values).toContain('low');
    expect(values).toContain('medium');
    expect(values).toContain('high');
    expect(values).toContain('critical');
  });

  it('AnomalyType covers expected types', () => {
    const values = Object.values(AnomalyType);
    expect(values).toContain('connectivity_loss');
    expect(values).toContain('confidence_drop');
    expect(values).toContain('unauthorized_access');
  });
});

describe('Parking Enums', () => {
  it('ParkingExceptionType includes all 5 prompt-required types', () => {
    const values = Object.values(ParkingExceptionType);
    expect(values).toContain('no_plate');
    expect(values).toContain('overtime');
    expect(values).toContain('unsettled');
    expect(values).toContain('duplicate_plate');
    expect(values).toContain('inconsistent_entry_exit');
    expect(values).toHaveLength(5);
  });

  it('ParkingExceptionStatus has open, escalated, resolved', () => {
    const values = Object.values(ParkingExceptionStatus);
    expect(values).toContain('open');
    expect(values).toContain('escalated');
    expect(values).toContain('resolved');
    expect(values).toHaveLength(3);
  });

  it('ParkingReaderType has entry and exit', () => {
    expect(Object.values(ParkingReaderType)).toContain('entry');
    expect(Object.values(ParkingReaderType)).toContain('exit');
  });
});

describe('After-Sales Enums', () => {
  it('TicketType includes delay, dispute, lost_item', () => {
    const values = Object.values(TicketType);
    expect(values).toContain('delay');
    expect(values).toContain('dispute');
    expect(values).toContain('lost_item');
    expect(values).toHaveLength(3);
  });

  it('TicketStatus covers full lifecycle', () => {
    const values = Object.values(TicketStatus);
    expect(values).toContain('open');
    expect(values).toContain('investigating');
    expect(values).toContain('pending_approval');
    expect(values).toContain('resolved');
    expect(values).toContain('closed');
  });

  it('CompensationDecision is binary: approved or rejected', () => {
    const values = Object.values(CompensationDecision);
    expect(values).toContain('approved');
    expect(values).toContain('rejected');
    expect(values).toHaveLength(2);
  });

  it('TicketPriority has 4 levels', () => {
    const values = Object.values(TicketPriority);
    expect(values).toContain('low');
    expect(values).toContain('medium');
    expect(values).toContain('high');
    expect(values).toContain('urgent');
    expect(values).toHaveLength(4);
  });
});

describe('Membership Enums', () => {
  it('LedgerEntryType has topup, spend, refund', () => {
    const values = Object.values(LedgerEntryType);
    expect(values).toContain('topup');
    expect(values).toContain('spend');
    expect(values).toContain('refund');
    expect(values).toHaveLength(3);
  });

  it('DiscountType has percentage and fixed_amount', () => {
    const values = Object.values(DiscountType);
    expect(values).toContain('percentage');
    expect(values).toContain('fixed_amount');
    expect(values).toHaveLength(2);
  });

  it('FulfillmentRequestStatus covers expected states', () => {
    const values = Object.values(FulfillmentRequestStatus);
    expect(values).toContain('draft');
    expect(values).toContain('submitted');
    expect(values).toContain('completed');
    expect(values).toContain('cancelled');
  });
});

describe('Observability Enums', () => {
  it('LogLevel has debug, info, warn, error', () => {
    const values = Object.values(LogLevel);
    expect(values).toContain('debug');
    expect(values).toContain('info');
    expect(values).toContain('warn');
    expect(values).toContain('error');
    expect(values).toHaveLength(4);
  });

  it('AlertOperator covers comparison operators', () => {
    const values = Object.values(AlertOperator);
    expect(values).toContain('gt');
    expect(values).toContain('gte');
    expect(values).toContain('lt');
    expect(values).toContain('lte');
    expect(values).toContain('eq');
  });

  it('NotificationType has banner and audible', () => {
    const values = Object.values(NotificationType);
    expect(values).toContain('banner');
    expect(values).toContain('audible');
    expect(values).toHaveLength(2);
  });
});

describe('Backup Enums', () => {
  it('BackupStatus has running, completed, failed', () => {
    const values = Object.values(BackupStatus);
    expect(values).toContain('running');
    expect(values).toContain('completed');
    expect(values).toContain('failed');
    expect(values).toHaveLength(3);
  });

  it('RestoreStatus matches BackupStatus values', () => {
    const values = Object.values(RestoreStatus);
    expect(values).toContain('running');
    expect(values).toContain('completed');
    expect(values).toContain('failed');
  });
});
