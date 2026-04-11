import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-for-fulfillment-tests');
vi.stubEnv('AES_KEY', 'a'.repeat(64));
vi.stubEnv('INTEGRATION_SIGNING_SECRET', 'test-integration-signing-secret-for-fulfillment-tests');

vi.mock('../src/modules/memberships/repository.js', () => ({
  findFulfillmentByIdempotencyKey: vi.fn(),
  findFulfillmentById: vi.fn(),
  createFulfillmentRequest: vi.fn(),
  createReceipt: vi.fn(),
}));

const service = await import('../src/modules/memberships/service.js');
const repo = await import('../src/modules/memberships/repository.js');

describe('fulfillment idempotency org isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replays existing fulfillment only within the same org', async () => {
    vi.mocked(repo.findFulfillmentByIdempotencyKey).mockResolvedValue({
      id: 'fulfil-1',
      orgId: 'org-1',
    } as any);
    vi.mocked(repo.findFulfillmentById).mockResolvedValue({
      id: 'fulfil-1',
      orgId: 'org-1',
    } as any);

    const result = await service.createFulfillment('org-1', {
      idempotencyKey: 'same-key',
      lineItems: [{ description: 'Item A', unitPrice: 10, quantity: 1 }],
    } as any);

    expect(result).toEqual({ id: 'fulfil-1', orgId: 'org-1' });
    expect(repo.findFulfillmentByIdempotencyKey).toHaveBeenCalledWith('same-key', 'org-1');
    expect(repo.createFulfillmentRequest).not.toHaveBeenCalled();
  });

  it('creates a new fulfillment when same key is not found for that org', async () => {
    vi.mocked(repo.findFulfillmentByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(repo.createFulfillmentRequest).mockResolvedValue({ id: 'fulfil-new' } as any);
    vi.mocked(repo.createReceipt).mockResolvedValue({ id: 'rcpt-1' } as any);
    vi.mocked(repo.findFulfillmentById).mockResolvedValue({
      id: 'fulfil-new',
      orgId: 'org-2',
      lineItems: [],
    } as any);

    const result = await service.createFulfillment('org-2', {
      idempotencyKey: 'same-key',
      lineItems: [{ description: 'Item B', unitPrice: 20, quantity: 1 }],
    } as any);

    expect(repo.findFulfillmentByIdempotencyKey).toHaveBeenCalledWith('same-key', 'org-2');
    expect(repo.createFulfillmentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-2', idempotencyKey: 'same-key' }),
    );
    expect(result).toEqual({ id: 'fulfil-new', orgId: 'org-2', lineItems: [] });
  });
});
