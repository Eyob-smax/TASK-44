import { describe, it, expect } from 'vitest';
import { LedgerEntryType } from '../src/modules/memberships/types.js';

// Pure wallet ledger logic — no DB or HTTP dependencies

interface LedgerEntry {
  entryType: LedgerEntryType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
}

function applyTopUp(currentBalance: number, amount: number): LedgerEntry {
  if (amount <= 0) throw new Error('Top-up amount must be greater than zero');
  const balanceBefore = currentBalance;
  const balanceAfter = parseFloat((balanceBefore + amount).toFixed(4));
  return { entryType: LedgerEntryType.TOPUP, amount, balanceBefore, balanceAfter };
}

function applySpend(currentBalance: number, amount: number): LedgerEntry {
  if (amount <= 0) throw new Error('Spend amount must be greater than zero');
  if (amount > currentBalance) {
    throw new Error(
      `Insufficient balance: $${currentBalance.toFixed(2)} available, $${amount.toFixed(2)} requested`,
    );
  }
  const balanceBefore = currentBalance;
  const balanceAfter = parseFloat((balanceBefore - amount).toFixed(4));
  return { entryType: LedgerEntryType.SPEND, amount, balanceBefore, balanceAfter };
}

function applyRefund(currentBalance: number, amount: number): LedgerEntry {
  if (amount <= 0) throw new Error('Refund amount must be greater than zero');
  const balanceBefore = currentBalance;
  const balanceAfter = parseFloat((balanceBefore + amount).toFixed(4));
  return { entryType: LedgerEntryType.REFUND, amount, balanceBefore, balanceAfter };
}

describe('Wallet top-up', () => {
  it('top-up from $0 balance of $50 → balanceAfter $50', () => {
    const entry = applyTopUp(0, 50);
    expect(entry.balanceBefore).toBe(0);
    expect(entry.balanceAfter).toBe(50);
    expect(entry.entryType).toBe(LedgerEntryType.TOPUP);
  });

  it('top-up from existing balance adds correctly', () => {
    const entry = applyTopUp(30, 20);
    expect(entry.balanceBefore).toBe(30);
    expect(entry.balanceAfter).toBe(50);
  });

  it('top-up amount is positive (non-zero)', () => {
    const entry = applyTopUp(0, 100);
    expect(entry.amount).toBe(100);
  });
});

describe('Wallet spend', () => {
  it('spend $20 from $50 balance → balanceAfter $30', () => {
    const entry = applySpend(50, 20);
    expect(entry.balanceBefore).toBe(50);
    expect(entry.balanceAfter).toBe(30);
    expect(entry.entryType).toBe(LedgerEntryType.SPEND);
  });

  it('spend entire balance → balanceAfter $0', () => {
    const entry = applySpend(50, 50);
    expect(entry.balanceAfter).toBe(0);
  });

  it('throws when spending more than balance', () => {
    expect(() => applySpend(10, 20)).toThrow('Insufficient balance');
  });

  it('throws when spending zero', () => {
    expect(() => applySpend(50, 0)).toThrow();
  });
});

describe('Wallet refund', () => {
  it('refund $10 to $30 balance → balanceAfter $40', () => {
    const entry = applyRefund(30, 10);
    expect(entry.balanceBefore).toBe(30);
    expect(entry.balanceAfter).toBe(40);
    expect(entry.entryType).toBe(LedgerEntryType.REFUND);
  });
});

describe('Ledger append-only invariant', () => {
  it('each operation produces a new entry object (no mutation)', () => {
    const entry1 = applyTopUp(0, 50);
    const entry2 = applySpend(entry1.balanceAfter, 20);
    // Entries are distinct objects
    expect(entry1).not.toBe(entry2);
    // entry1 is unchanged
    expect(entry1.balanceAfter).toBe(50);
    expect(entry2.balanceBefore).toBe(50);
    expect(entry2.balanceAfter).toBe(30);
  });

  it('sequence of operations: topup → spend → refund', () => {
    const t = applyTopUp(0, 100);
    const s = applySpend(t.balanceAfter, 40);
    const r = applyRefund(s.balanceAfter, 10);
    expect(t.balanceAfter).toBe(100);
    expect(s.balanceAfter).toBe(60);
    expect(r.balanceAfter).toBe(70);
  });
});
