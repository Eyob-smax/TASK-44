import { db } from '../../app/container.js';
import { encrypt, decrypt } from '../../common/encryption/aes256.js';
import { NotFoundError, UnprocessableError } from '../../common/errors/app-errors.js';
import { LedgerEntryType } from './types.js';
import type {
  CreateMemberRequest,
  CreateCouponRequest,
} from './types.js';

// ---- Tiers ----

export async function createTier(orgId: string, data: {
  name: string;
  level: number;
  pointsThreshold: number;
  benefits: string[];
}) {
  return db.membershipTier.create({
    data: {
      orgId,
      name: data.name,
      level: data.level,
      pointsThreshold: data.pointsThreshold,
      benefits: JSON.stringify(data.benefits),
    },
  });
}

export async function findTierById(id: string) {
  return db.membershipTier.findUnique({ where: { id } });
}

export async function listTiers(orgId: string) {
  return db.membershipTier.findMany({ where: { orgId }, orderBy: { level: 'asc' } });
}

export async function findNextTier(orgId: string, currentLevel: number) {
  return db.membershipTier.findFirst({
    where: { orgId, level: { gt: currentLevel } },
    orderBy: { level: 'asc' },
  });
}

// ---- Members ----

export async function createMember(orgId: string, data: CreateMemberRequest) {
  const tier = await findTierById(data.tierId);
  if (!tier || tier.orgId !== orgId) throw new NotFoundError('Membership tier not found');

  return db.member.create({
    data: {
      orgId,
      userId: data.userId ?? null,
      studentId: data.studentId ?? null,
      tierId: data.tierId,
    },
  });
}

export async function findMemberById(id: string) {
  return db.member.findUnique({
    where: { id },
    include: { tier: true, wallet: true },
  });
}

export async function listMembers(
  orgId: string,
  filters: { search?: string; tierId?: string },
  pagination: { page: number; limit: number },
) {
  const where: Record<string, unknown> = { orgId };
  if (filters.tierId) where['tierId'] = filters.tierId;
  if (filters.search) {
    where['student'] = {
      OR: [
        { firstName: { contains: filters.search } },
        { lastName: { contains: filters.search } },
      ],
    };
  }
  const skip = (pagination.page - 1) * pagination.limit;
  const [items, total] = await Promise.all([
    db.member.findMany({
      where,
      include: { tier: true, wallet: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pagination.limit,
    }),
    db.member.count({ where }),
  ]);
  return { items, total };
}

export async function findMemberByStudentId(studentId: string) {
  return db.member.findFirst({
    where: { studentId },
    include: { tier: true, wallet: true },
  });
}

export async function updateMemberTier(memberId: string, tierId: string) {
  return db.member.update({ where: { id: memberId }, data: { tierId } });
}

// ---- Growth points ----

export async function addPointTransaction(
  memberId: string,
  points: number,
  reason: string,
  referenceType?: string,
  referenceId?: string,
) {
  return db.$transaction(async (tx) => {
    const transaction = await tx.growthPointTransaction.create({
      data: {
        memberId,
        points,
        reason,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
      },
    });

    await tx.member.update({
      where: { id: memberId },
      data: { growthPoints: { increment: points } },
    });

    return transaction;
  });
}

// ---- Coupons ----

export async function findCouponByCode(orgId: string, code: string) {
  return db.coupon.findUnique({ where: { orgId_code: { orgId, code } } });
}

export async function incrementCouponRedemption(couponId: string) {
  return db.coupon.update({
    where: { id: couponId },
    data: { currentRedemptions: { increment: 1 } },
  });
}

export async function createCouponRedemption(
  couponId: string,
  memberId: string,
  fulfillmentRequestId?: string,
) {
  return db.couponRedemption.create({
    data: {
      couponId,
      memberId,
      fulfillmentRequestId: fulfillmentRequestId ?? null,
    },
  });
}

export async function createCoupon(orgId: string, data: CreateCouponRequest) {
  return db.coupon.create({
    data: {
      orgId,
      code: data.code,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minOrderAmount: data.minOrderAmount ?? null,
      tierId: data.tierId ?? null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      maxRedemptions: data.maxRedemptions ?? null,
    },
  });
}

// ---- Pricing rules ----

export async function findPricingRules(orgId: string, tierId: string) {
  return db.memberPricingRule.findMany({
    where: { orgId, tierId, isActive: true },
  });
}

// ---- Wallet ----

function encryptBalance(amount: number): string {
  return encrypt(amount.toFixed(4));
}

function decryptBalance(encrypted: string): number {
  return parseFloat(decrypt(encrypted));
}

export async function createWallet(memberId: string) {
  return db.storedValueWallet.create({
    data: {
      memberId,
      encryptedBalance: encryptBalance(0),
      isEnabled: true,
    },
  });
}

export async function findWalletByMember(memberId: string) {
  const wallet = await db.storedValueWallet.findUnique({ where: { memberId } });
  if (!wallet) return null;
  return { ...wallet, balance: decryptBalance(wallet.encryptedBalance) };
}

export async function topUpWallet(
  walletId: string,
  amount: number,
  referenceType?: string,
  referenceId?: string,
) {
  return db.$transaction(async (tx) => {
    const wallet = await tx.storedValueWallet.findUniqueOrThrow({ where: { id: walletId } });
    const balanceBefore = decryptBalance(wallet.encryptedBalance);
    const balanceAfter = parseFloat((balanceBefore + amount).toFixed(4));

    await tx.storedValueWallet.update({
      where: { id: walletId },
      data: { encryptedBalance: encryptBalance(balanceAfter) },
    });

    return tx.walletLedgerEntry.create({
      data: {
        walletId,
        entryType: LedgerEntryType.TOPUP,
        amount,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
        balanceBefore,
        balanceAfter,
      },
    });
  });
}

export async function spendFromWallet(
  walletId: string,
  amount: number,
  referenceType?: string,
  referenceId?: string,
) {
  return db.$transaction(async (tx) => {
    const wallet = await tx.storedValueWallet.findUniqueOrThrow({ where: { id: walletId } });
    const balanceBefore = decryptBalance(wallet.encryptedBalance);

    if (amount > balanceBefore) {
      throw new UnprocessableError(
        `Insufficient wallet balance. Balance: $${balanceBefore.toFixed(2)}, requested: $${amount.toFixed(2)}`,
      );
    }

    const balanceAfter = parseFloat((balanceBefore - amount).toFixed(4));

    await tx.storedValueWallet.update({
      where: { id: walletId },
      data: { encryptedBalance: encryptBalance(balanceAfter) },
    });

    return tx.walletLedgerEntry.create({
      data: {
        walletId,
        entryType: LedgerEntryType.SPEND,
        amount,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
        balanceBefore,
        balanceAfter,
      },
    });
  });
}

export async function refundToWallet(
  walletId: string,
  amount: number,
  referenceType?: string,
  referenceId?: string,
) {
  return db.$transaction(async (tx) => {
    const wallet = await tx.storedValueWallet.findUniqueOrThrow({ where: { id: walletId } });
    const balanceBefore = decryptBalance(wallet.encryptedBalance);
    const balanceAfter = parseFloat((balanceBefore + amount).toFixed(4));

    await tx.storedValueWallet.update({
      where: { id: walletId },
      data: { encryptedBalance: encryptBalance(balanceAfter) },
    });

    return tx.walletLedgerEntry.create({
      data: {
        walletId,
        entryType: LedgerEntryType.REFUND,
        amount,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
        balanceBefore,
        balanceAfter,
      },
    });
  });
}

// ---- Fulfillment ----

export async function findFulfillmentByIdempotencyKey(idempotencyKey: string, orgId: string) {
  return db.fulfillmentRequest.findFirst({
    where: { idempotencyKey, orgId },
  });
}

export async function createFulfillmentRequest(data: {
  orgId: string;
  memberId?: string;
  idempotencyKey: string;
  totalAmount: number;
  shippingFee: number;
  discountAmount: number;
  finalAmount: number;
  lineItems: { description: string; unitPrice: number; quantity: number; memberPrice?: number }[];
}) {
  return db.$transaction(async (tx) => {
    const request = await tx.fulfillmentRequest.create({
      data: {
        orgId: data.orgId,
        memberId: data.memberId ?? null,
        idempotencyKey: data.idempotencyKey,
        totalAmount: data.totalAmount,
        shippingFee: data.shippingFee,
        discountAmount: data.discountAmount,
        finalAmount: data.finalAmount,
        status: 'submitted',
      },
    });

    await tx.fulfillmentLineItem.createMany({
      data: data.lineItems.map((li) => ({
        requestId: request.id,
        description: li.description,
        unitPrice: li.unitPrice,
        quantity: li.quantity,
        memberPrice: li.memberPrice ?? null,
      })),
    });

    return request;
  });
}

export async function findFulfillmentById(id: string) {
  return db.fulfillmentRequest.findUnique({
    where: { id },
    include: { lineItems: true },
  });
}

// ---- Receipts ----

function generateReceiptNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `RCP-${year}-${random}`;
}

export async function createReceipt(data: {
  fulfillmentRequestId?: string;
  walletLedgerEntryId?: string;
  fileAssetId?: string;
}) {
  return db.printableReceipt.create({
    data: {
      fulfillmentRequestId: data.fulfillmentRequestId ?? null,
      walletLedgerEntryId: data.walletLedgerEntryId ?? null,
      fileAssetId: data.fileAssetId ?? null,
      receiptNumber: generateReceiptNumber(),
    },
  });
}
