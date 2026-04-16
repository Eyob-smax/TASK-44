import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRepo = {
  findShipmentOrgById: vi.fn(),
  findParcelWithShipmentOrgById: vi.fn(),
  createTicket: vi.fn(),
  findTicketById: vi.fn(),
  addEvidence: vi.fn(),
  findActivePolicies: vi.fn(),
  findApprovedSuggestionsTotal: vi.fn(),
  createSuggestion: vi.fn(),
  findSuggestionById: vi.fn(),
  createApproval: vi.fn(),
};

vi.mock('../src/modules/after-sales/repository.js', () => mockRepo);
vi.mock('../src/app/container.js', () => ({ db: {} }));

const service = await import('../src/modules/after-sales/service.js');

const ORG_ID = 'org-1';
const OTHER_ORG = 'org-other';
const USER_ID = 'user-1';

beforeEach(() => vi.clearAllMocks());

// ============================================================================
// createTicket
// ============================================================================

describe('createTicket', () => {
  it('creates a medium-priority ticket with 24h SLA deadline when priority is omitted', async () => {
    mockRepo.createTicket.mockResolvedValue({ id: 'tk-1' });
    const before = Date.now();
    await service.createTicket(ORG_ID, USER_ID, {
      type: 'delay' as any,
      description: 'Package delayed',
    });
    const call = mockRepo.createTicket.mock.calls[0][0];
    expect(call.priority).toBe('medium');
    const deltaMs = (call.slaDeadlineAt as Date).getTime() - before;
    // ~24 hours
    expect(deltaMs).toBeGreaterThan(23.9 * 60 * 60 * 1000);
    expect(deltaMs).toBeLessThan(24.1 * 60 * 60 * 1000);
  });

  it('sets 4h SLA deadline for urgent priority', async () => {
    mockRepo.createTicket.mockResolvedValue({ id: 'tk-1' });
    const before = Date.now();
    await service.createTicket(ORG_ID, USER_ID, {
      type: 'delay' as any,
      priority: 'urgent' as any,
      description: 'ASAP',
    });
    const call = mockRepo.createTicket.mock.calls[0][0];
    const deltaMs = (call.slaDeadlineAt as Date).getTime() - before;
    expect(deltaMs).toBeGreaterThan(3.9 * 60 * 60 * 1000);
    expect(deltaMs).toBeLessThan(4.1 * 60 * 60 * 1000);
  });

  it('throws NotFoundError when shipment does not exist', async () => {
    mockRepo.findShipmentOrgById.mockResolvedValue(null);
    await expect(
      service.createTicket(ORG_ID, USER_ID, {
        type: 'delay' as any,
        shipmentId: 'missing',
        description: 'x',
      }),
    ).rejects.toThrow(/Shipment not found/);
    expect(mockRepo.createTicket).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when shipment belongs to a different org', async () => {
    mockRepo.findShipmentOrgById.mockResolvedValue({
      warehouse: { orgId: OTHER_ORG },
    });
    await expect(
      service.createTicket(ORG_ID, USER_ID, {
        type: 'delay' as any,
        shipmentId: 'shp-x',
        description: 'x',
      }),
    ).rejects.toThrow(/Shipment not found/);
  });

  it('throws NotFoundError when parcel does not exist', async () => {
    mockRepo.findParcelWithShipmentOrgById.mockResolvedValue(null);
    await expect(
      service.createTicket(ORG_ID, USER_ID, {
        type: 'lost_item' as any,
        parcelId: 'missing',
        description: 'x',
      }),
    ).rejects.toThrow(/Parcel not found/);
  });

  it('throws NotFoundError when parcel belongs to a different org', async () => {
    mockRepo.findParcelWithShipmentOrgById.mockResolvedValue({
      shipmentId: 'shp-1',
      shipment: { warehouse: { orgId: OTHER_ORG } },
    });
    await expect(
      service.createTicket(ORG_ID, USER_ID, {
        type: 'lost_item' as any,
        parcelId: 'prc-1',
        description: 'x',
      }),
    ).rejects.toThrow(/Parcel not found/);
  });

  it('throws NotFoundError when parcel does not belong to the specified shipment', async () => {
    mockRepo.findShipmentOrgById.mockResolvedValue({
      warehouse: { orgId: ORG_ID },
    });
    mockRepo.findParcelWithShipmentOrgById.mockResolvedValue({
      shipmentId: 'shp-OTHER',
      shipment: { warehouse: { orgId: ORG_ID } },
    });
    await expect(
      service.createTicket(ORG_ID, USER_ID, {
        type: 'lost_item' as any,
        shipmentId: 'shp-1',
        parcelId: 'prc-1',
        description: 'x',
      }),
    ).rejects.toThrow(/Parcel not found/);
  });
});

// ============================================================================
// addEvidence
// ============================================================================

describe('addEvidence', () => {
  it('throws NotFoundError when ticket does not exist', async () => {
    mockRepo.findTicketById.mockResolvedValue(null);
    await expect(service.addEvidence('tk-missing', 'file-1', USER_ID)).rejects.toThrow(
      /Ticket not found/,
    );
  });

  it('throws UnprocessableError when ticket is CLOSED', async () => {
    mockRepo.findTicketById.mockResolvedValue({ id: 'tk-1', status: 'closed' });
    await expect(service.addEvidence('tk-1', 'file-1', USER_ID)).rejects.toThrow(
      /Cannot add evidence to a closed ticket/,
    );
    expect(mockRepo.addEvidence).not.toHaveBeenCalled();
  });

  it('adds evidence when ticket is open and returns repo result', async () => {
    mockRepo.findTicketById.mockResolvedValue({ id: 'tk-1', status: 'open' });
    mockRepo.addEvidence.mockResolvedValue({ id: 'ev-1' });
    const result = await service.addEvidence('tk-1', 'file-1', USER_ID, 'Photo');
    expect(mockRepo.addEvidence).toHaveBeenCalledWith({
      ticketId: 'tk-1',
      fileAssetId: 'file-1',
      uploadedByUserId: USER_ID,
      description: 'Photo',
    });
    expect(result).toMatchObject({ id: 'ev-1' });
  });
});

// ============================================================================
// suggestCompensation
// ============================================================================

describe('suggestCompensation', () => {
  it('throws NotFoundError when ticket does not exist', async () => {
    mockRepo.findTicketById.mockResolvedValue(null);
    await expect(service.suggestCompensation('missing', ORG_ID, USER_ID)).rejects.toThrow(
      /Ticket not found/,
    );
  });

  it('throws UnprocessableError when ticket type has no compensation trigger mapping', async () => {
    mockRepo.findTicketById.mockResolvedValue({ id: 'tk-1', type: 'other' });
    await expect(service.suggestCompensation('tk-1', ORG_ID, USER_ID)).rejects.toThrow(
      /No compensation trigger defined/,
    );
  });

  it('throws NotFoundError when no active policy exists for trigger type', async () => {
    mockRepo.findTicketById.mockResolvedValue({ id: 'tk-1', type: 'delay' });
    mockRepo.findActivePolicies.mockResolvedValue([]);
    await expect(service.suggestCompensation('tk-1', ORG_ID, USER_ID)).rejects.toThrow(
      /No active compensation policy/,
    );
  });

  it('throws UnprocessableError when cap has been exhausted (capped <= 0)', async () => {
    mockRepo.findTicketById.mockResolvedValue({ id: 'tk-1', type: 'delay' });
    mockRepo.findActivePolicies.mockResolvedValue([
      {
        id: 'pol-1',
        compensationAmount: { toString: () => '50' },
        maxCapPerTicket: { toString: () => '100' },
      },
    ]);
    mockRepo.findApprovedSuggestionsTotal.mockResolvedValue(100); // already at cap
    await expect(service.suggestCompensation('tk-1', ORG_ID, USER_ID)).rejects.toThrow(
      /Compensation cap has been reached/,
    );
    expect(mockRepo.createSuggestion).not.toHaveBeenCalled();
  });

  it('creates suggestion capped at the per-ticket remaining budget', async () => {
    mockRepo.findTicketById.mockResolvedValue({ id: 'tk-1', type: 'delay' });
    mockRepo.findActivePolicies.mockResolvedValue([
      {
        id: 'pol-1',
        compensationAmount: { toString: () => '80' },
        maxCapPerTicket: { toString: () => '100' },
      },
    ]);
    mockRepo.findApprovedSuggestionsTotal.mockResolvedValue(30); // remaining = 70
    mockRepo.createSuggestion.mockResolvedValue({ id: 'sug-1' });

    await service.suggestCompensation('tk-1', ORG_ID, USER_ID);
    const call = mockRepo.createSuggestion.mock.calls[0][0];
    expect(call.ticketId).toBe('tk-1');
    expect(call.policyId).toBe('pol-1');
    // Policy is $80, but only $70 remains → cap to $70
    expect(call.suggestedAmount).toBe(70);
    expect(call.reason).toContain('$80.00');
    expect(call.reason).toContain('$70.00');
  });

  it('creates suggestion with full policy amount when budget allows', async () => {
    mockRepo.findTicketById.mockResolvedValue({ id: 'tk-1', type: 'lost_item' });
    mockRepo.findActivePolicies.mockResolvedValue([
      {
        id: 'pol-1',
        compensationAmount: { toString: () => '40' },
        maxCapPerTicket: { toString: () => '200' },
      },
    ]);
    mockRepo.findApprovedSuggestionsTotal.mockResolvedValue(0);
    mockRepo.createSuggestion.mockResolvedValue({ id: 'sug-2' });

    await service.suggestCompensation('tk-1', ORG_ID, USER_ID);
    const call = mockRepo.createSuggestion.mock.calls[0][0];
    expect(call.suggestedAmount).toBe(40);
  });
});

// ============================================================================
// approveCompensation
// ============================================================================

describe('approveCompensation', () => {
  it('throws NotFoundError when suggestion does not exist', async () => {
    mockRepo.findSuggestionById.mockResolvedValue(null);
    await expect(service.approveCompensation('missing', USER_ID, 'approved')).rejects.toThrow(
      /Compensation suggestion not found/,
    );
  });

  it('throws UnprocessableError when suggestion is not pending', async () => {
    mockRepo.findSuggestionById.mockResolvedValue({ id: 'sug-1', status: 'approved' });
    await expect(service.approveCompensation('sug-1', USER_ID, 'approved')).rejects.toThrow(
      /Cannot approve suggestion with status 'approved'/,
    );
    expect(mockRepo.createApproval).not.toHaveBeenCalled();
  });

  it('throws UnprocessableError when approval would exceed default cap', async () => {
    mockRepo.findSuggestionById.mockResolvedValue({
      id: 'sug-1',
      status: 'pending',
      ticketId: 'tk-1',
      suggestedAmount: { toString: () => '25' },
    });
    // DEFAULT_COMPENSATION_CAP is $50. $30 previously approved → remaining $20 → $25 > $20
    mockRepo.findApprovedSuggestionsTotal.mockResolvedValue(30);
    await expect(service.approveCompensation('sug-1', USER_ID, 'approved')).rejects.toThrow(
      /exceed the per-ticket compensation cap/,
    );
    expect(mockRepo.createApproval).not.toHaveBeenCalled();
  });

  it('records approval decision=approved when within cap', async () => {
    mockRepo.findSuggestionById.mockResolvedValue({
      id: 'sug-1',
      status: 'pending',
      ticketId: 'tk-1',
      suggestedAmount: { toString: () => '10' },
    });
    mockRepo.findApprovedSuggestionsTotal.mockResolvedValue(0);
    mockRepo.createApproval.mockResolvedValue({ id: 'apr-1' });
    await service.approveCompensation('sug-1', USER_ID, 'approved', 'looks good');
    expect(mockRepo.createApproval).toHaveBeenCalledWith({
      suggestionId: 'sug-1',
      approvedByUserId: USER_ID,
      decision: 'approved',
      notes: 'looks good',
    });
  });

  it('records approval decision=rejected without checking cap', async () => {
    mockRepo.findSuggestionById.mockResolvedValue({
      id: 'sug-1',
      status: 'pending',
      ticketId: 'tk-1',
      suggestedAmount: { toString: () => '99999' }, // would exceed any cap
    });
    mockRepo.createApproval.mockResolvedValue({ id: 'apr-2' });

    await service.approveCompensation('sug-1', USER_ID, 'rejected', 'nope');
    expect(mockRepo.createApproval).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'rejected' }),
    );
    expect(mockRepo.findApprovedSuggestionsTotal).not.toHaveBeenCalled();
  });
});
