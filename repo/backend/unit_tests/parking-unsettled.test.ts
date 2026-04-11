import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParkingExceptionType } from '../src/modules/parking/types.js';

vi.stubEnv('DATABASE_URL', 'mysql://test:test@localhost:3306/test');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-for-parking-tests');
vi.stubEnv('AES_KEY', 'a'.repeat(64));
vi.stubEnv('INTEGRATION_SIGNING_SECRET', 'test-integration-signing-secret-for-parking-tests');

vi.mock('../src/app/container.js', () => ({
  db: {
    parkingReader: { findUnique: vi.fn() },
    role: { findFirst: vi.fn() },
    userRole: { findFirst: vi.fn() },
  },
}));

vi.mock('../src/modules/parking/repository.js', () => ({
  findCompletedSessionsOlderThan: vi.fn(),
  hasUnsettledException: vi.fn(),
  createException: vi.fn(),
}));

const { checkUnsettledSessions } = await import('../src/modules/parking/service.js');
const { findCompletedSessionsOlderThan, hasUnsettledException, createException } =
  await import('../src/modules/parking/repository.js');

describe('checkUnsettledSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates unsettled exceptions for completed sessions beyond threshold', async () => {
    vi.mocked(findCompletedSessionsOlderThan).mockResolvedValue([
      {
        id: 'session-1',
        plateNumber: 'ABC-123',
      },
    ] as any);
    vi.mocked(hasUnsettledException).mockResolvedValue(false);
    vi.mocked(createException).mockResolvedValue({ id: 'exc-1' } as any);

    const result = await checkUnsettledSessions('facility-1', 15);

    expect(result).toEqual(['session-1']);
    expect(createException).toHaveBeenCalledWith(
      expect.objectContaining({
        facilityId: 'facility-1',
        type: ParkingExceptionType.UNSETTLED,
        relatedSessionId: 'session-1',
      }),
    );
  });

  it('does not duplicate unsettled exceptions for sessions already marked unsettled', async () => {
    vi.mocked(findCompletedSessionsOlderThan).mockResolvedValue([
      {
        id: 'session-1',
        plateNumber: 'ABC-123',
      },
    ] as any);
    vi.mocked(hasUnsettledException).mockResolvedValue(true);

    const result = await checkUnsettledSessions('facility-1', 15);

    expect(result).toEqual([]);
    expect(createException).not.toHaveBeenCalled();
  });

  it('returns empty result when no completed sessions match threshold', async () => {
    vi.mocked(findCompletedSessionsOlderThan).mockResolvedValue([] as any);

    const result = await checkUnsettledSessions('facility-1', 15);

    expect(result).toEqual([]);
    expect(hasUnsettledException).not.toHaveBeenCalled();
    expect(createException).not.toHaveBeenCalled();
  });
});
