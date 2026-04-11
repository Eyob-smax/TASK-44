import { z } from 'zod';

export const createStudentSchema = z.object({
  studentNumber: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(200).optional(),
});

export const updateStudentSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(200).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const createDepartmentSchema = z.object({
  campusId: z.string().uuid(),
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20).regex(/^[A-Z0-9-]+$/, 'Code must be uppercase alphanumeric with dashes'),
});

export const createCourseSchema = z.object({
  deptId: z.string().uuid(),
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20).regex(/^[A-Z0-9-]+$/, 'Code must be uppercase alphanumeric with dashes'),
  credits: z.number().int().min(0).max(12).optional(),
});

export const createClassSchema = z.object({
  courseId: z.string().uuid(),
  semesterId: z.string().uuid(),
  section: z.string().min(1).max(20),
  capacity: z.number().int().min(1).max(500).optional(),
});

export const createSemesterSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
}).refine((data) => data.startDate < data.endDate, {
  message: 'Start date must be before end date',
  path: ['endDate'],
});
