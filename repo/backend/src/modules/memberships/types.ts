// Memberships Domain Types

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
}

export enum LedgerEntryType {
  TOPUP = 'topup',
  SPEND = 'spend',
  REFUND = 'refund',
}

export enum FulfillmentRequestStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface MembershipTier {
  id: string;
  orgId: string;
  name: string;
  level: number;
  pointsThreshold: number;
  benefits: string; // JSON
  createdAt: Date;
  updatedAt: Date;
}

export interface Member {
  id: string;
  orgId: string;
  userId: string | null;
  studentId: string | null;
  tierId: string;
  growthPoints: number;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface GrowthPointTransaction {
  id: string;
  memberId: string;
  points: number;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: Date;
}

export interface Coupon {
  id: string;
  orgId: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number | null;
  tierId: string | null;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  currentRedemptions: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberPricingRule {
  id: string;
  orgId: string;
  tierId: string;
  itemCategory: string;
  discountPercent: number;
  isActive: boolean;
}

export interface StoredValueWallet {
  id: string;
  memberId: string;
  encryptedBalance: string; // AES-256 encrypted
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletLedgerEntry {
  id: string;
  walletId: string;
  entryType: LedgerEntryType;
  amount: number; // always positive
  referenceType: string | null;
  referenceId: string | null;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: Date;
}

export interface FulfillmentRequest {
  id: string;
  orgId: string;
  memberId: string | null;
  status: FulfillmentRequestStatus;
  totalAmount: number;
  shippingFee: number;
  discountAmount: number;
  finalAmount: number;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FulfillmentLineItem {
  id: string;
  requestId: string;
  description: string;
  unitPrice: number;
  quantity: number;
  memberPrice: number | null;
}

export interface PrintableReceipt {
  id: string;
  fulfillmentRequestId: string | null;
  walletLedgerEntryId: string | null;
  receiptNumber: string;
  generatedAt: Date;
  fileAssetId: string | null;
}

// --- Request DTOs ---

export interface CreateMemberRequest {
  studentId?: string;
  userId?: string;
  tierId: string;
}

export interface CreateCouponRequest {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount?: number;
  tierId?: string;
  expiresAt?: string;
  maxRedemptions?: number;
}

export interface WalletTopUpRequest {
  amount: number; // must be > 0
}

export interface WalletSpendRequest {
  amount: number; // must be > 0, must be <= current balance
  referenceType?: string;
  referenceId?: string;
}

export interface CreateFulfillmentRequest {
  memberId?: string;
  idempotencyKey: string;
  lineItems: {
    description: string;
    unitPrice: number;
    quantity: number;
    itemCategory?: string;
  }[];
  couponCode?: string;
  useWallet?: boolean;
  shippingZipCode?: string;
  shippingTier?: string;
}

// --- Response DTOs ---

export interface MemberResponse {
  id: string;
  tierName: string;
  tierLevel: number;
  growthPoints: number;
  walletEnabled: boolean;
  walletBalance: number | null; // null if wallet not enabled
  joinedAt: string;
}

export interface WalletBalanceResponse {
  walletId: string;
  isEnabled: boolean;
  balance: number;
  lastTransactionAt: string | null;
}

export interface FulfillmentResponse {
  id: string;
  status: FulfillmentRequestStatus;
  lineItems: FulfillmentLineItem[];
  totalAmount: number;
  shippingFee: number;
  discountAmount: number;
  finalAmount: number;
  createdAt: string;
}
