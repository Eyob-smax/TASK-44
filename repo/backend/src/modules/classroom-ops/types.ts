// Classroom Operations Domain Types

export enum ClassroomStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  DEGRADED = 'degraded',
}

export enum AnomalyType {
  CONNECTIVITY_LOSS = 'connectivity_loss',
  CONFIDENCE_DROP = 'confidence_drop',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  HARDWARE_FAILURE = 'hardware_failure',
  UNEXPECTED_RESTART = 'unexpected_restart',
}

export enum AnomalySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AnomalyStatus {
  OPEN = 'open',
  ACKNOWLEDGED = 'acknowledged',
  ASSIGNED = 'assigned',
  RESOLVED = 'resolved',
}

export interface Classroom {
  id: string;
  campusId: string;
  name: string;
  building: string | null;
  room: string | null;
  capacity: number;
  status: ClassroomStatus;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassroomHeartbeat {
  id: string;
  classroomId: string;
  receivedAt: Date;
  metadata: string | null;
}

export interface RecognitionConfidenceSample {
  id: string;
  classroomId: string;
  confidence: number; // 0.0 to 1.0
  sampledAt: Date;
}

export interface AnomalyEvent {
  id: string;
  classroomId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string | null;
  detectedAt: Date;
  status: AnomalyStatus;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnomalyAcknowledgement {
  id: string;
  anomalyEventId: string;
  userId: string;
  acknowledgedAt: Date;
}

export interface AnomalyAssignment {
  id: string;
  anomalyEventId: string;
  assignedToUserId: string;
  assignedByUserId: string;
  assignedAt: Date;
}

export interface AnomalyResolution {
  id: string;
  anomalyEventId: string;
  userId: string;
  resolutionNote: string; // REQUIRED — must not be empty
  resolvedAt: Date;
}

// --- Request DTOs ---

export interface AcknowledgeAnomalyRequest {
  anomalyEventId: string;
}

export interface AssignAnomalyRequest {
  anomalyEventId: string;
  assignedToUserId: string;
}

export interface ResolveAnomalyRequest {
  anomalyEventId: string;
  resolutionNote: string; // required, non-empty
}

export interface IngestHeartbeatRequest {
  classroomId: string;
  metadata?: Record<string, unknown>;
}

export interface IngestConfidenceRequest {
  classroomId: string;
  confidence: number;
}

// --- Response DTOs ---

export interface DashboardClassroomResponse {
  id: string;
  name: string;
  building: string | null;
  room: string | null;
  status: ClassroomStatus;
  lastHeartbeatAt: string | null;
  latestConfidence: number | null;
  openAnomalyCount: number;
}

export interface AnomalyEventResponse {
  id: string;
  classroomId: string;
  classroomName: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string | null;
  detectedAt: string;
  status: AnomalyStatus;
  acknowledgement: { userId: string; at: string } | null;
  assignment: { assignedTo: string; assignedBy: string; at: string } | null;
  resolution: { userId: string; note: string; at: string } | null;
}
