import { get, post } from './api-client.js';

export interface MemberResponse {
  id: string;
  studentId: string | null;
  userId: string | null;
  tierName: string;
  tierLevel: number;
  growthPoints: number;
  walletEnabled: boolean;
  walletBalance: number | null;
  joinedAt: string;
}

export interface WalletBalanceResponse {
  walletId: string;
  isEnabled: boolean;
  balance: number;
  lastTransactionAt: string | null;
}

export interface WalletLedgerEntryResponse {
  id: string;
  entryType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
}

export interface ReceiptResponse {
  id: string;
  receiptNumber: string;
  generatedAt: string;
}

export interface WalletOperationResponse {
  walletId: string;
  memberId: string;
  ledgerEntry: WalletLedgerEntryResponse;
  receipt: ReceiptResponse;
}

export interface FulfillmentLineItem {
  productId?: string;
  productName?: string;
  description: string;
  unitPrice: number;
  quantity: number;
  itemCategory?: string;
}

export interface FulfillmentResponse {
  id: string;
  status: string;
  lineItems: FulfillmentLineItem[];
  totalAmount: number;
  shippingFee: number;
  discountAmount: number;
  finalAmount: number;
  couponCode?: string;
  createdAt: string;
}

export interface CreateFulfillmentPayload {
  memberId?: string;
  idempotencyKey: string;
  lineItems: FulfillmentLineItem[];
  couponCode?: string;
  useWallet?: boolean;
  shippingZipCode?: string;
  shippingTier?: string;
}

export interface MembershipTierResponse {
  id: string;
  name: string;
  level: number;
  pointsThreshold: number;
  benefits: string;
}

export interface CreateMemberPayload {
  studentId?: string;
  userId?: string;
  tierId: string;
}

export const membershipsService = {
  async listTiers(orgId: string): Promise<MembershipTierResponse[]> {
    return get(`/orgs/${orgId}/membership-tiers`);
  },

  async listMembers(
    orgId: string,
    filters: { search?: string; tierId?: string } = {},
    page = 1,
    limit = 50,
  ): Promise<{ members: MemberResponse[]; total: number }> {
    return get(`/orgs/${orgId}/members`, { ...filters, page, limit });
  },

  async createMember(orgId: string, payload: CreateMemberPayload): Promise<MemberResponse> {
    return post(`/orgs/${orgId}/members`, payload);
  },

  async getMember(memberId: string): Promise<MemberResponse> {
    return get(`/members/${memberId}`);
  },

  async getWallet(memberId: string): Promise<WalletBalanceResponse> {
    return get(`/members/${memberId}/wallet`);
  },

  async topUpWallet(
    memberId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<WalletOperationResponse> {
    return post(
      `/members/${memberId}/wallet/topup`,
      { amount },
      { headers: { 'X-Idempotency-Key': idempotencyKey } },
    );
  },

  async spendFromWallet(
    memberId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<WalletOperationResponse> {
    return post(
      `/members/${memberId}/wallet/spend`,
      { amount },
      { headers: { 'X-Idempotency-Key': idempotencyKey } },
    );
  },

  async createFulfillment(
    orgId: string,
    payload: CreateFulfillmentPayload,
  ): Promise<FulfillmentResponse> {
    return post(`/orgs/${orgId}/fulfillments`, payload);
  },
};
