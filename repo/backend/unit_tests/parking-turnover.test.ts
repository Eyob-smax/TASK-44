import { describe, expect, it } from 'vitest';
import { calculateTurnoverPerHour } from '../src/modules/parking/types.js';

describe('calculateTurnoverPerHour', () => {
  it('returns entry events per hour as-is for integer counts', () => {
    expect(calculateTurnoverPerHour(0)).toBe(0);
    expect(calculateTurnoverPerHour(7)).toBe(7);
  });

  it('rounds to two decimals for non-integer values', () => {
    expect(calculateTurnoverPerHour(3.456)).toBe(3.46);
    expect(calculateTurnoverPerHour(3.451)).toBe(3.45);
  });

  it('never returns a negative turnover', () => {
    expect(calculateTurnoverPerHour(-1)).toBe(0);
  });
});
