// Auth & Security Domain Types

export enum MaskType {
  FULL = 'full',
  PARTIAL = 'partial',
  HASH = 'hash',
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface Permission {
  id: string;
  action: string;
  resource: string;
  scope: string;
}

export interface FieldMaskingRule {
  id: string;
  roleId: string;
  resource: string;
  field: string;
  maskType: MaskType;
}

export interface LoginAttempt {
  id: string;
  userId: string | null;
  username: string;
  success: boolean;
  ipAddress: string;
  timestamp: Date;
}

export interface SecurityEvent {
  id: string;
  eventType: string;
  userId: string | null;
  details: string; // encrypted at rest
  ipAddress: string;
  timestamp: Date;
}

// --- Request DTOs ---

export interface LoginRequest {
  username: string;
  password: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  displayName: string;
  roleIds: string[];
  orgId?: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  isActive?: boolean;
  roleIds?: string[];
}

// --- Response DTOs ---

export interface UserResponse {
  id: string;
  username: string;
  displayName: string;
  orgId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: { id: string; name: string }[];
  createdAt: string;
}

export interface AuthSessionResponse {
  user: UserResponse;
  permissions: string[];
  token: string;
}
