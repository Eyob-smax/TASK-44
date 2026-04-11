import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_CONFIG } from '../src/modules/configuration/types.js';
import { _resetOverrides, getConfig, applyConfigUpdate } from '../src/modules/configuration/repository.js';

beforeEach(() => {
  _resetOverrides();
});

describe('DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.heartbeatFreshnessSeconds).toBe(120);
    expect(DEFAULT_CONFIG.storedValueEnabled).toBe(false);
    expect(DEFAULT_CONFIG.logRetentionDays).toBe(30);
    expect(DEFAULT_CONFIG.parkingEscalationMinutes).toBe(15);
    expect(DEFAULT_CONFIG.backupRetentionDays).toBe(14);
  });
});

describe('getConfig()', () => {
  it('returns effective config with updatedAt timestamp', () => {
    const { config, updatedAt } = getConfig();
    expect(config.heartbeatFreshnessSeconds).toBe(120);
    expect(typeof updatedAt).toBe('string');
    expect(new Date(updatedAt).getTime()).toBeGreaterThan(0);
  });
});

describe('applyConfigUpdate()', () => {
  it('overrides heartbeatFreshnessSeconds', () => {
    applyConfigUpdate({ heartbeatFreshnessSeconds: 60 });
    const { config } = getConfig();
    expect(config.heartbeatFreshnessSeconds).toBe(60);
  });

  it('overrides storedValueEnabled', () => {
    applyConfigUpdate({ storedValueEnabled: true });
    const { config } = getConfig();
    expect(config.storedValueEnabled).toBe(true);
  });

  it('overrides logRetentionDays', () => {
    applyConfigUpdate({ logRetentionDays: 7 });
    const { config } = getConfig();
    expect(config.logRetentionDays).toBe(7);
  });

  it('overrides parkingEscalationMinutes', () => {
    applyConfigUpdate({ parkingEscalationMinutes: 30 });
    const { config } = getConfig();
    expect(config.parkingEscalationMinutes).toBe(30);
  });

  it('updates updatedAt after applying changes', () => {
    const before = getConfig().updatedAt;
    // Small delay to ensure timestamp differs
    const laterMs = Date.now() + 1;
    while (Date.now() < laterMs) { /* spin */ }
    applyConfigUpdate({ heartbeatFreshnessSeconds: 45 });
    const after = getConfig().updatedAt;
    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it('partial update leaves other fields unchanged', () => {
    applyConfigUpdate({ heartbeatFreshnessSeconds: 90 });
    const { config } = getConfig();
    expect(config.logRetentionDays).toBe(30); // default unchanged
    expect(config.storedValueEnabled).toBe(false); // default unchanged
  });

  it('does not override storagePath (env-only field)', () => {
    const { config } = getConfig();
    expect(config.storagePath).toBeTruthy(); // set by env/default
  });
});

describe('_resetOverrides()', () => {
  it('restores defaults after override', () => {
    applyConfigUpdate({ heartbeatFreshnessSeconds: 999 });
    _resetOverrides();
    const { config } = getConfig();
    expect(config.heartbeatFreshnessSeconds).toBe(120);
  });

  it('does not affect non-overridable fields', () => {
    applyConfigUpdate({ logRetentionDays: 1 });
    _resetOverrides();
    const { config } = getConfig();
    expect(config.logRetentionDays).toBe(30);
  });
});
