import { get, post } from './api-client.js';

export interface ShipmentResponse {
  id: string;
  warehouseId: string;
  carrierId: string;
  trackingNumber: string | null;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  estimatedDeliveryAt: string | null;
  createdAt: string;
  parcels: ParcelResponse[];
  tracking: TrackingUpdateResponse[];
}

export interface ParcelResponse {
  id: string;
  description: string;
  weightLb: number;
  quantity: number;
  status: string;
}

export interface TrackingUpdateResponse {
  id: string;
  status: string;
  location: string | null;
  timestamp: string;
  source: string;
}

export interface WarehouseResponse {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
}

export interface CarrierResponse {
  id: string;
  name: string;
  connectorType: string;
  isActive: boolean;
}

export interface CreateShipmentPayload {
  warehouseId: string;
  carrierId: string;
  trackingNumber?: string;
  parcels: { description: string; weightLb: number; quantity: number }[];
  idempotencyKey: string;
}

export const logisticsService = {
  async listWarehouses(orgId: string): Promise<WarehouseResponse[]> {
    return get(`/orgs/${orgId}/warehouses`);
  },

  async listCarriers(orgId: string): Promise<CarrierResponse[]> {
    return get(`/orgs/${orgId}/carriers`);
  },

  async createShipment(orgId: string, payload: CreateShipmentPayload): Promise<ShipmentResponse> {
    const { idempotencyKey, ...shipment } = payload;
    return post(
      '/shipments',
      { ...shipment, orgId },
      { headers: { 'X-Idempotency-Key': idempotencyKey } },
    );
  },

  async getShipment(shipmentId: string): Promise<ShipmentResponse> {
    return get(`/shipments/${shipmentId}`);
  },

  async addTrackingUpdate(
    shipmentId: string,
    status: string,
    location?: string,
  ): Promise<TrackingUpdateResponse> {
    return post(`/shipments/${shipmentId}/tracking`, { status, location, source: 'manual' });
  },

  async listShipments(
    orgId: string,
    filters: { status?: string } = {},
    page = 1,
    limit = 50,
  ): Promise<{ shipments: ShipmentResponse[]; total: number }> {
    return get(`/orgs/${orgId}/shipments`, { ...filters, page, limit });
  },
};
