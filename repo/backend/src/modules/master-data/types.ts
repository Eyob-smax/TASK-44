// Master Data Domain Types

export interface Organization {
  id: string;
  name: string;
  type: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Campus {
  id: string;
  orgId: string;
  name: string;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Department {
  id: string;
  campusId: string;
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Course {
  id: string;
  deptId: string;
  name: string;
  code: string;
  credits: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Semester {
  id: string;
  orgId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Class {
  id: string;
  courseId: string;
  semesterId: string;
  section: string;
  capacity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Student {
  id: string;
  orgId: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  enrolledAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassEnrollment {
  id: string;
  classId: string;
  studentId: string;
  enrolledAt: Date;
}

// --- Request DTOs ---

export interface CreateStudentRequest {
  studentNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface UpdateStudentRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface CreateDepartmentRequest {
  campusId: string;
  name: string;
  code: string;
}

export interface CreateCourseRequest {
  deptId: string;
  name: string;
  code: string;
  credits?: number;
}

export interface CreateClassRequest {
  courseId: string;
  semesterId: string;
  section: string;
  capacity?: number;
}

export interface CreateSemesterRequest {
  name: string;
  startDate: string;
  endDate: string;
}

// --- Response DTOs ---

export interface StudentResponse {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  enrolledAt: string;
}

export interface DepartmentResponse {
  id: string;
  campusId: string;
  name: string;
  code: string;
}

export interface CourseResponse {
  id: string;
  deptId: string;
  name: string;
  code: string;
  credits: number;
}

// --- Import/Export ---

export type ImportableEntity = 'students' | 'classes' | 'departments' | 'courses' | 'semesters';

export interface ImportRowValidationError {
  rowNumber: number;
  field: string;
  errorMessage: string;
  rawValue: string | null;
}
