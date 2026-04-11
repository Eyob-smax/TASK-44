import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../../common/errors/app-errors.js';
import { decrypt } from '../../common/encryption/aes256.js';
import { db } from '../../app/container.js';
import * as service from './service.js';
import * as repo from './repository.js';

// ---- Tiers ----

export async function createTierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const tier = await repo.createTier(req.params.orgId, req.body);
    res.status(201).json({ success: true, data: tier });
  } catch (err) { next(err); }
}

export async function listTiersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const tiers = await repo.listTiers(req.params.orgId);
    res.json({ success: true, data: tiers });
  } catch (err) { next(err); }
}

// ---- Members ----

export async function listMembersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query['page'] as string ?? '1', 10) || 1;
    const limit = parseInt(req.query['limit'] as string ?? '25', 10) || 25;
    const search = req.query['search'] as string | undefined;
    const tierId = req.query['tierId'] as string | undefined;
    const result = await repo.listMembers(req.params.orgId, { search, tierId }, { page, limit });
    res.json({ success: true, data: { members: result.items, total: result.total } });
  } catch (err) { next(err); }
}

export async function createMemberHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const member = await repo.createMember(req.params.orgId, req.body);
    res.status(201).json({ success: true, data: member });
  } catch (err) { next(err); }
}

export async function getMemberHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const member = await repo.findMemberById(req.params.id);
    if (!member) throw new NotFoundError('Member not found');
    if (req.user!.orgId && member.orgId !== req.user!.orgId) throw new NotFoundError('Member not found');
    const walletBalance = member.wallet
      ? parseFloat(decrypt(member.wallet.encryptedBalance))
      : null;
    res.json({
      success: true,
      data: {
        id: member.id,
        orgId: member.orgId,
        tierName: member.tier.name,
        tierLevel: member.tier.level,
        growthPoints: member.growthPoints,
        walletEnabled: member.wallet?.isEnabled ?? false,
        walletBalance,
        joinedAt: member.joinedAt.toISOString(),
      },
    });
  } catch (err) { next(err); }
}

// ---- Coupons ----

export async function createCouponHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const coupon = await repo.createCoupon(req.params.orgId, req.body);
    res.status(201).json({ success: true, data: coupon });
  } catch (err) { next(err); }
}

// ---- Wallet ----

export async function getWalletHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const member = await repo.findMemberById(req.params.id);
    if (!member) throw new NotFoundError('Wallet not found');
    if (req.user!.orgId && member.orgId !== req.user!.orgId) throw new NotFoundError('Wallet not found');
    if (!member.wallet) throw new NotFoundError('Wallet not found');
    const balance = parseFloat(decrypt(member.wallet.encryptedBalance));
    const lastEntry = await db.walletLedgerEntry.findFirst({
      where: { walletId: member.wallet.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      success: true,
      data: {
        walletId: member.wallet.id,
        isEnabled: member.wallet.isEnabled,
        balance,
        lastTransactionAt: lastEntry?.createdAt?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
}

export async function topUpWalletHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const member = await repo.findMemberById(req.params.id);
    if (!member) throw new NotFoundError('Member not found');
    if (req.user!.orgId && member.orgId !== req.user!.orgId) throw new NotFoundError('Member not found');
    const { amount } = req.body as { amount: number };
    const result = await service.topUpWallet(req.params.id, amount);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function spendFromWalletHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const member = await repo.findMemberById(req.params.id);
    if (!member) throw new NotFoundError('Member not found');
    if (req.user!.orgId && member.orgId !== req.user!.orgId) throw new NotFoundError('Member not found');
    const { amount, referenceType, referenceId } = req.body as {
      amount: number;
      referenceType?: string;
      referenceId?: string;
    };
    const result = await service.spendFromWallet(req.params.id, amount, referenceType, referenceId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ---- Fulfillment ----

export async function createFulfillmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const fulfillment = await service.createFulfillment(req.params.orgId, req.body);
    res.status(201).json({ success: true, data: fulfillment });
  } catch (err) { next(err); }
}

export async function getFulfillmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const fulfillment = await repo.findFulfillmentById(req.params.id);
    if (!fulfillment) throw new NotFoundError('Fulfillment request not found');
    if (req.user!.orgId && fulfillment.orgId !== req.user!.orgId) {
      throw new NotFoundError('Fulfillment request not found');
    }
    res.json({ success: true, data: fulfillment });
  } catch (err) { next(err); }
}
