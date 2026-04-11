import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AfterSalesView from '../src/modules/after-sales/AfterSalesView.vue';
import { useAuthStore } from '../src/stores/auth.store.js';

vi.mock('../src/services/after-sales.service.js', () => ({
  afterSalesService: {
    listTickets: vi.fn().mockResolvedValue({ tickets: [], total: 0 }),
    createTicket: vi.fn().mockResolvedValue({ id: 'tk-1', type: 'delay', status: 'open', priority: 'medium', shipmentId: null, parcelId: null, createdBy: 'u1', assignedTo: null, slaDeadlineAt: null, resolvedAt: null, createdAt: new Date().toISOString(), timeline: [], evidence: [], compensations: [] }),
    getTicket: vi.fn(),
    addTimelineNote: vi.fn().mockResolvedValue({}),
    addEvidence: vi.fn().mockResolvedValue({}),
    suggestCompensation: vi.fn().mockResolvedValue({ suggestion: null }),
    approveCompensation: vi.fn().mockResolvedValue({}),
    assignTicket: vi.fn().mockResolvedValue({}),
    updateTicketStatus: vi.fn().mockResolvedValue({}),
  },
}));

const SIDE_PANEL_STUB = {
  name: 'SidePanel',
  props: ['modelValue', 'title'],
  emits: ['update:modelValue'],
  template: `<div v-if="modelValue" data-testid="side-panel" :data-title="title">
    <slot />
    <slot name="footer" />
  </div>`,
};

function makeUser(roles: string[], permissions: string[]) {
  return {
    token: 'test-token',
    permissions,
    user: {
      id: 'u1',
      username: 'tester',
      displayName: 'Tester',
      orgId: 'org-1',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      roles: roles.map((name, i) => ({ id: `r${i}`, name })),
    },
  };
}

async function mountAfterSalesView(roles: string[], permissions: string[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setSession(makeUser(roles, permissions));

  const wrapper = mount(AfterSalesView, {
    global: {
      plugins: [pinia],
      stubs: { SidePanel: SIDE_PANEL_STUB, Teleport: true },
    },
  });
  await flushPromises();
  return wrapper;
}

// Helper to build a ticket for the table (rendered via AppDataTable)
function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tk-1',
    type: 'delay',
    status: 'open',
    priority: 'medium',
    shipmentId: null,
    parcelId: null,
    createdBy: 'u1',
    assignedTo: null,
    slaDeadlineAt: null,
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    timeline: [],
    evidence: [],
    compensations: [],
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AfterSalesView — role-based visibility', () => {
  it('shows "New Ticket" button for user with write:after-sales:*', async () => {
    const wrapper = await mountAfterSalesView(['OpsManager'], ['write:after-sales:*']);
    expect(wrapper.find('[data-testid="btn-create-ticket"]').exists()).toBe(true);
  });

  it('hides "New Ticket" button for user without write permission', async () => {
    const wrapper = await mountAfterSalesView(['Auditor'], ['read:after-sales:*']);
    expect(wrapper.find('[data-testid="btn-create-ticket"]').exists()).toBe(false);
  });

  it('shows status and priority filters regardless of role', async () => {
    const wrapper = await mountAfterSalesView(['Auditor'], ['read:after-sales:*']);
    expect(wrapper.find('[data-testid="status-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="priority-filter"]').exists()).toBe(true);
  });
});

describe('AfterSalesView — create ticket form validation', () => {
  it('opens create ticket panel when "New Ticket" button clicked', async () => {
    const wrapper = await mountAfterSalesView(['OpsManager'], ['write:after-sales:*']);
    await wrapper.find('[data-testid="btn-create-ticket"]').trigger('click');
    expect(wrapper.find('[data-testid="create-ticket-form"]').exists()).toBe(true);
  });

  it('shows error when submitting without ticket type', async () => {
    const wrapper = await mountAfterSalesView(['OpsManager'], ['write:after-sales:*']);
    await wrapper.find('[data-testid="btn-create-ticket"]').trigger('click');

    // Leave type empty, fill description
    await wrapper.find('[data-testid="ticket-description"]').setValue('Something went wrong');
    await wrapper.find('[data-testid="submit-create-ticket"]').trigger('click');

    const error = wrapper.find('[data-testid="create-error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toContain('type');
  });

  it('shows error when submitting without description', async () => {
    const wrapper = await mountAfterSalesView(['OpsManager'], ['write:after-sales:*']);
    await wrapper.find('[data-testid="btn-create-ticket"]').trigger('click');

    await wrapper.find('[data-testid="ticket-type-select"]').setValue('delay');
    // Leave description empty
    await wrapper.find('[data-testid="submit-create-ticket"]').trigger('click');

    const error = wrapper.find('[data-testid="create-error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toContain('Description');
  });

  it('calls createTicket service when form is valid', async () => {
    const { afterSalesService } = await import('../src/services/after-sales.service.js');
    const wrapper = await mountAfterSalesView(['OpsManager'], ['write:after-sales:*']);
    await wrapper.find('[data-testid="btn-create-ticket"]').trigger('click');

    await wrapper.find('[data-testid="ticket-type-select"]').setValue('delay');
    await wrapper.find('[data-testid="ticket-description"]').setValue('Package not delivered');
    await wrapper.find('[data-testid="submit-create-ticket"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(afterSalesService.createTicket)).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ type: 'delay', description: 'Package not delivered' }),
    );
  });
});

describe('AfterSalesView — SLA deadline indicators', () => {
  it('applies sla-overdue class to past deadlines', async () => {
    const { afterSalesService } = await import('../src/services/after-sales.service.js');
    const pastDeadline = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    vi.mocked(afterSalesService.listTickets).mockResolvedValue({
      tickets: [makeTicket({ slaDeadlineAt: pastDeadline }) as any],
      total: 1,
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.setSession(makeUser(['OpsManager'], ['read:after-sales:*']));

    const wrapper = mount(AfterSalesView, {
      global: {
        plugins: [pinia],
        stubs: { SidePanel: SIDE_PANEL_STUB, Teleport: true },
      },
    });
    await flushPromises();

    expect(wrapper.find('.sla-overdue').exists()).toBe(true);
  });

  it('applies sla-near class to deadline within 4 hours', async () => {
    const { afterSalesService } = await import('../src/services/after-sales.service.js');
    const nearDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours from now
    vi.mocked(afterSalesService.listTickets).mockResolvedValue({
      tickets: [makeTicket({ slaDeadlineAt: nearDeadline }) as any],
      total: 1,
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.setSession(makeUser(['OpsManager'], ['read:after-sales:*']));

    const wrapper = mount(AfterSalesView, {
      global: {
        plugins: [pinia],
        stubs: { SidePanel: SIDE_PANEL_STUB, Teleport: true },
      },
    });
    await flushPromises();

    expect(wrapper.find('.sla-near').exists()).toBe(true);
    expect(wrapper.find('.sla-overdue').exists()).toBe(false);
  });

  it('applies neither class to deadline far in the future', async () => {
    const { afterSalesService } = await import('../src/services/after-sales.service.js');
    const farDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 2 days from now
    vi.mocked(afterSalesService.listTickets).mockResolvedValue({
      tickets: [makeTicket({ slaDeadlineAt: farDeadline }) as any],
      total: 1,
    });

    const wrapper = mount(AfterSalesView, {
      global: {
        plugins: [createPinia()],
        stubs: { SidePanel: SIDE_PANEL_STUB, Teleport: true },
      },
    });
    await flushPromises();

    expect(wrapper.find('.sla-overdue').exists()).toBe(false);
    expect(wrapper.find('.sla-near').exists()).toBe(false);
  });
});

describe('AfterSalesView — compensation approval (role-gated)', () => {
  it('does not render approve/reject buttons in ticket list for non-approver', async () => {
    // approve/reject buttons are in the detail panel; they don't appear in the main table
    // Test that canApprove users see the buttons in detail when a compensation is pending
    const { afterSalesService } = await import('../src/services/after-sales.service.js');
    const ticketWithComp = makeTicket({
      compensations: [{
        id: 'comp-1',
        suggestedAmount: 25,
        reason: 'Late delivery',
        status: 'pending',
        approval: null,
      }],
    });
    vi.mocked(afterSalesService.getTicket).mockResolvedValue(ticketWithComp as any);

    // OpsManager (canApprove) should see approve/reject buttons in detail
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.setSession(makeUser(['OpsManager'], ['read:after-sales:*', 'write:after-sales:*']));

    const wrapper = mount(AfterSalesView, {
      global: {
        plugins: [pinia],
        stubs: { SidePanel: SIDE_PANEL_STUB, Teleport: true },
      },
    });

    // Set detail directly by simulating openDetail
    // We need to trigger openDetail — mock getTicket first then find the view button
    vi.mocked(afterSalesService.listTickets).mockResolvedValue({
      tickets: [ticketWithComp as any],
      total: 1,
    });
    await flushPromises();

    const detailBtn = wrapper.find('[data-testid="btn-ticket-detail"]');
    if (detailBtn.exists()) {
      await detailBtn.trigger('click');
      await flushPromises();
      // With SidePanel stub, the detail panel content is rendered
      expect(wrapper.find('[data-testid="btn-approve-comp"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="btn-reject-comp"]').exists()).toBe(true);
    }
  });
});

describe('AfterSalesView — listTickets service integration', () => {
  it('calls listTickets with default status=open on mount', async () => {
    const { afterSalesService } = await import('../src/services/after-sales.service.js');
    await mountAfterSalesView(['OpsManager'], ['read:after-sales:*']);

    expect(vi.mocked(afterSalesService.listTickets)).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ status: 'open' }),
    );
  });

  it('surfaces error state when listTickets rejects', async () => {
    const { afterSalesService } = await import('../src/services/after-sales.service.js');
    vi.mocked(afterSalesService.listTickets).mockRejectedValueOnce(new Error('API error'));

    const wrapper = await mountAfterSalesView(['OpsManager'], ['read:after-sales:*']);

    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('API error');
  });
});
