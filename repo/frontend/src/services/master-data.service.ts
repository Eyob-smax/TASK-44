import { get, post } from './api-client.js';

export interface StudentResponse {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ImportJobResponse {
  id: string;
  entityType: string;
  status: string;
  fileName: string | null;
  successRows: number | null;
  failedRows: number | null;
  errorReportAssetId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ExportJobResponse {
  id: string;
  entityType: string;
  format: string;
  status: string;
  fileAssetId: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface CampusResponse {
  id: string;
  orgId: string;
  name: string;
  address: string | null;
}

export const masterDataService = {
  async listCampuses(orgId: string): Promise<CampusResponse[]> {
    return get(`/orgs/${orgId}/campuses`);
  },

  async listStudents(
    orgId: string,
    filters: { search?: string } = {},
    page = 1,
    limit = 20,
  ): Promise<{ students: StudentResponse[]; total: number }> {
    return get(`/orgs/${orgId}/students`, { ...filters, page, limit });
  },

  async triggerImport(
    orgId: string,
    entityType: string,
    fileName?: string,
  ): Promise<{ importJobId: string; jobId: string }> {
    return post(`/orgs/${orgId}/import`, { entityType, fileName });
  },

  async getImportJob(orgId: string, jobId: string): Promise<ImportJobResponse> {
    return get(`/orgs/${orgId}/import/${jobId}`);
  },

  async triggerExport(
    orgId: string,
    entityType: string,
    format: 'csv' | 'xlsx' = 'csv',
  ): Promise<{ exportJobId: string; jobId: string }> {
    return post(`/orgs/${orgId}/export`, { entityType, format });
  },

  async getExportJob(orgId: string, jobId: string): Promise<ExportJobResponse> {
    return get(`/orgs/${orgId}/export/${jobId}`);
  },
};
