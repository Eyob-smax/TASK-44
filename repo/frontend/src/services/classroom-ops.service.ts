import { get, post } from './api-client.js';

export interface AnomalyEventResponse {
  id: string;
  classroomId: string;
  classroomName: string;
  type: string;
  severity: string;
  description: string | null;
  detectedAt: string;
  status: string;
  acknowledgement: { userId: string; at: string } | null;
  assignment: { assignedTo: string; assignedBy: string; at: string } | null;
  resolution: { userId: string; note: string; at: string } | null;
}

export interface DashboardClassroomResponse {
  id: string;
  name: string;
  building: string | null;
  room: string | null;
  status: string;
  lastHeartbeatAt: string | null;
  latestConfidence: number | null;
  openAnomalyCount: number;
}

export interface AnomalyListFilters {
  status?: string;
  severity?: string;
  classroomId?: string;
}

export const classroomOpsService = {
  async getDashboard(campusId: string): Promise<DashboardClassroomResponse[]> {
    return get('/classroom-ops/dashboard', { campusId });
  },

  async listAnomalies(
    filters: AnomalyListFilters = {},
    page = 1,
    limit = 20,
  ): Promise<{ anomalies: AnomalyEventResponse[]; total: number }> {
    return get('/classroom-ops/anomalies', { ...filters, page, limit });
  },

  async acknowledge(anomalyId: string): Promise<AnomalyEventResponse> {
    return post(`/classroom-ops/anomalies/${anomalyId}/acknowledge`);
  },

  async assign(anomalyId: string, assignedToUserId: string): Promise<AnomalyEventResponse> {
    return post(`/classroom-ops/anomalies/${anomalyId}/assign`, { assignedToUserId });
  },

  async resolve(anomalyId: string, resolutionNote: string): Promise<AnomalyEventResponse> {
    return post(`/classroom-ops/anomalies/${anomalyId}/resolve`, { resolutionNote });
  },
};
