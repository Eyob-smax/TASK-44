import { get, post } from './api-client.js';

export interface ParkingStatusResponse {
  facilityId: string;
  facilityName: string;
  totalSpaces: number;
  occupiedSpaces: number;
  availableSpaces: number;
  turnoverPerHour: number;
  openExceptions: number;
  escalatedExceptions: number;
}

export interface ParkingFacilityResponse {
  id: string;
  campusId: string;
  name: string;
  totalSpaces: number;
}

export interface ParkingExceptionResponse {
  id: string;
  facilityName: string;
  type: string;
  status: string;
  description: string | null;
  plateNumber: string | null;
  createdAt: string;
  escalatedAt: string | null;
  minutesSinceCreated: number;
  isEscalationEligible: boolean;
}

export interface ParkingExceptionFilters {
  status?: string;
  type?: string;
  facilityId?: string;
}

export const parkingService = {
  async listFacilities(): Promise<ParkingFacilityResponse[]> {
    return get('/parking/facilities');
  },

  async getFacilityStatus(facilityId: string): Promise<ParkingStatusResponse> {
    return get(`/parking/facilities/${facilityId}/status`);
  },

  async listExceptions(
    filters: ParkingExceptionFilters = {},
    page = 1,
    limit = 20,
  ): Promise<{ exceptions: ParkingExceptionResponse[]; total: number }> {
    return get('/parking/exceptions', { ...filters, page, limit });
  },

  async resolveException(exceptionId: string, resolutionNote: string): Promise<ParkingExceptionResponse> {
    return post(`/parking/exceptions/${exceptionId}/resolve`, { resolutionNote });
  },

  async escalateException(exceptionId: string): Promise<ParkingExceptionResponse> {
    return post(`/parking/exceptions/${exceptionId}/escalate`);
  },
};
