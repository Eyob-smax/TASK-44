import { apiClient, get, post } from './api-client.js';

export interface TicketResponse {
  id: string;
  type: string;
  status: string;
  priority: string;
  shipmentId: string | null;
  parcelId: string | null;
  createdBy: string;
  assignedTo: string | null;
  slaDeadlineAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  timeline: TimelineEntryResponse[];
  evidence: EvidenceResponse[];
  compensations: CompensationResponse[];
}

export interface TimelineEntryResponse {
  id: string;
  entryType: string;
  content: string;
  userId: string;
  createdAt: string;
}

export interface EvidenceResponse {
  id: string;
  fileAssetId: string;
  description: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

export interface CompensationResponse {
  id: string;
  suggestedAmount: number;
  reason: string;
  status: string;
  approval: {
    decision: string;
    approvedBy: string;
    notes: string | null;
    decidedAt: string;
  } | null;
}

export interface CompensationSuggestionResponse {
  suggestion: CompensationResponse | null;
}

export interface UploadedFileResponse {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface CreateTicketPayload {
  type: string;
  shipmentId?: string;
  parcelId?: string;
  priority?: string;
  description: string;
}

export interface TicketFilters {
  status?: string;
  type?: string;
  priority?: string;
}

export const afterSalesService = {
  async createTicket(orgId: string, payload: CreateTicketPayload): Promise<TicketResponse> {
    return post(`/orgs/${orgId}/tickets`, payload);
  },

  async listTickets(
    orgId: string,
    filters: TicketFilters = {},
    page = 1,
    limit = 20,
  ): Promise<{ tickets: TicketResponse[]; total: number }> {
    return get(`/orgs/${orgId}/tickets`, { ...filters, page, limit });
  },

  async getTicket(ticketId: string): Promise<TicketResponse> {
    return get(`/tickets/${ticketId}`);
  },

  async addTimelineNote(ticketId: string, content: string): Promise<TimelineEntryResponse> {
    return post(`/tickets/${ticketId}/timeline`, { entryType: 'note', content });
  },

  async addEvidence(
    ticketId: string,
    fileAssetId: string,
    description?: string,
  ): Promise<EvidenceResponse> {
    return post(`/tickets/${ticketId}/evidence`, { fileAssetId, description });
  },

  async uploadEvidenceFile(file: File): Promise<UploadedFileResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<{ data: UploadedFileResponse }>('/files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  async suggestCompensation(
    ticketId: string,
    orgId: string,
  ): Promise<CompensationSuggestionResponse> {
    return post(`/tickets/${ticketId}/suggest-compensation`, { orgId });
  },

  async approveCompensation(
    ticketId: string,
    suggestionId: string,
    decision: 'approved' | 'rejected',
    notes?: string,
  ): Promise<CompensationResponse> {
    return post(`/tickets/${ticketId}/compensations/${suggestionId}/approve`, { decision, notes });
  },

  async assignTicket(ticketId: string, assignedToUserId: string): Promise<TicketResponse> {
    return post(`/tickets/${ticketId}/assign`, { assignedToUserId });
  },

  async updateTicketStatus(ticketId: string, status: string): Promise<TicketResponse> {
    return post(`/tickets/${ticketId}/status`, { status });
  },
};
