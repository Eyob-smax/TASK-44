import { describe, it, expect } from 'vitest';
import { createStudentSchema } from '../src/modules/master-data/schemas.js';
import type { ImportRowValidationError } from '../src/modules/master-data/types.js';

// Extracted row-validation logic mirroring importStudents() in service.ts

function validateStudentRow(
  raw: Record<string, unknown>,
  rowNumber: number,
): ImportRowValidationError[] {
  const errors: ImportRowValidationError[] = [];
  const parsed = createStudentSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    for (const [field, messages] of Object.entries(fieldErrors)) {
      errors.push({
        rowNumber,
        field,
        errorMessage: (messages as string[])[0] ?? 'Invalid value',
        rawValue: raw[field] !== undefined ? String(raw[field]) : null,
      });
    }
  }
  return errors;
}

describe('Import row validation — students', () => {
  it('valid row produces no errors', () => {
    const errors = validateStudentRow(
      { studentNumber: 'S001', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
      1,
    );
    expect(errors).toHaveLength(0);
  });

  it('missing firstName produces error for firstName field', () => {
    const errors = validateStudentRow(
      { studentNumber: 'S002', lastName: 'Doe' },
      2,
    );
    expect(errors.some((e) => e.field === 'firstName')).toBe(true);
    expect(errors.find((e) => e.field === 'firstName')?.rowNumber).toBe(2);
  });

  it('invalid email format produces error for email field', () => {
    const errors = validateStudentRow(
      { studentNumber: 'S003', firstName: 'Bob', lastName: 'Smith', email: 'not-an-email' },
      3,
    );
    expect(errors.some((e) => e.field === 'email')).toBe(true);
  });

  it('studentNumber exceeding 50 characters produces error', () => {
    const errors = validateStudentRow(
      { studentNumber: 'S'.repeat(51), firstName: 'Alice', lastName: 'Jones' },
      4,
    );
    expect(errors.some((e) => e.field === 'studentNumber')).toBe(true);
  });

  it('multiple bad fields on one row produces multiple errors', () => {
    const errors = validateStudentRow(
      { studentNumber: '', firstName: '', lastName: '' }, // all empty
      5,
    );
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('error includes rawValue for the bad field', () => {
    const errors = validateStudentRow(
      { studentNumber: 'S005', firstName: 'Jane', lastName: 'Doe', email: 'bad-email' },
      6,
    );
    const emailError = errors.find((e) => e.field === 'email');
    expect(emailError?.rawValue).toBe('bad-email');
  });

  it('validation failure on row N does not affect row N+1 result', () => {
    const errorsRow1 = validateStudentRow({ studentNumber: '', firstName: '' }, 1);
    const errorsRow2 = validateStudentRow(
      { studentNumber: 'S006', firstName: 'Valid', lastName: 'Person' },
      2,
    );
    expect(errorsRow1.length).toBeGreaterThan(0);
    expect(errorsRow2).toHaveLength(0);
  });

  it('optional email field missing produces no error', () => {
    const errors = validateStudentRow(
      { studentNumber: 'S007', firstName: 'No', lastName: 'Email' },
      7,
    );
    expect(errors).toHaveLength(0);
  });
});
