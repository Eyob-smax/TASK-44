import { describe, it, expect } from 'vitest';

// Pure state machine helpers mirroring service.ts logic — no DB or HTTP deps

const AnomalyStatus = {
  OPEN: 'open',
  ACKNOWLEDGED: 'acknowledged',
  ASSIGNED: 'assigned',
  RESOLVED: 'resolved',
} as const;

type Status = (typeof AnomalyStatus)[keyof typeof AnomalyStatus];

function canAcknowledge(status: Status): boolean {
  return status === AnomalyStatus.OPEN;
}

function canAssign(status: Status): boolean {
  return status === AnomalyStatus.OPEN || status === AnomalyStatus.ACKNOWLEDGED;
}

function canResolve(status: Status): boolean {
  return status !== AnomalyStatus.RESOLVED;
}

function validateResolutionNote(note: string): boolean {
  return note.trim().length > 0;
}

describe('Anomaly status transitions', () => {
  it('open anomaly can be acknowledged', () => {
    expect(canAcknowledge(AnomalyStatus.OPEN)).toBe(true);
  });

  it('acknowledged anomaly cannot be re-acknowledged', () => {
    expect(canAcknowledge(AnomalyStatus.ACKNOWLEDGED)).toBe(false);
  });

  it('assigned anomaly cannot be acknowledged', () => {
    expect(canAcknowledge(AnomalyStatus.ASSIGNED)).toBe(false);
  });

  it('resolved anomaly cannot be acknowledged', () => {
    expect(canAcknowledge(AnomalyStatus.RESOLVED)).toBe(false);
  });

  it('open anomaly can be assigned', () => {
    expect(canAssign(AnomalyStatus.OPEN)).toBe(true);
  });

  it('acknowledged anomaly can be assigned', () => {
    expect(canAssign(AnomalyStatus.ACKNOWLEDGED)).toBe(true);
  });

  it('resolved anomaly cannot be assigned', () => {
    expect(canAssign(AnomalyStatus.RESOLVED)).toBe(false);
  });

  it('open anomaly can be resolved', () => {
    expect(canResolve(AnomalyStatus.OPEN)).toBe(true);
  });

  it('acknowledged anomaly can be resolved', () => {
    expect(canResolve(AnomalyStatus.ACKNOWLEDGED)).toBe(true);
  });

  it('already resolved anomaly cannot be resolved again', () => {
    expect(canResolve(AnomalyStatus.RESOLVED)).toBe(false);
  });
});

describe('Resolution note validation', () => {
  it('non-empty resolution note is valid', () => {
    expect(validateResolutionNote('Fixed the camera connection')).toBe(true);
  });

  it('whitespace-only resolution note is invalid', () => {
    expect(validateResolutionNote('   ')).toBe(false);
  });

  it('empty string resolution note is invalid', () => {
    expect(validateResolutionNote('')).toBe(false);
  });

  it('single character note is valid', () => {
    expect(validateResolutionNote('x')).toBe(true);
  });

  it('multi-line note is valid', () => {
    expect(validateResolutionNote('Line 1\nLine 2')).toBe(true);
  });
});
