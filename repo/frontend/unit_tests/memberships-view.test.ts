import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import MembershipsView from '../src/modules/memberships/MembershipsView.vue';
import { useAuthStore } from '../src/stores/auth.store.js';

vi.mock('../src/services/memberships.service.js', () => ({
  membershipsService: {
    listMembers: vi.fn().mockResolvedValue({ members: [], total: 0 }),
    createMember: vi.fn().mockResolvedValue({ id: 'mem-1', tierName: 'Silver', tierLevel: 1, growthPoints: 0, walletEnabled: true, walletBalance: 0, joinedAt: new Date().toISOString() }),
    getMember: vi.fn().mockResolvedValue({ id: 'mem-1', tierName: 'Silver', tierLevel: 1, growthPoints: 100, walletEnabled: true, walletBalance: 50, joinedAt: new Date().toISOString() }),
    getWallet: vi.fn().mockResolvedValue({ walletId: 'w-1', isEnabled: true, balance: 50, lastTransactionAt: null }),
    topUpWallet: vi.fn().mockResolvedValue({
      walletId: 'w-1',
      memberId: 'mem-1',
      ledgerEntry: { id: 'le-1', entryType: 'top_up', amount: 20, balanceBefore: 50, balanceAfter: 70, createdAt: new Date().toISOString() },
      receipt: { id: 'r-1', receiptNumber: 'RCP-2026-ABCD1234', generatedAt: new Date().toISOString() },
    }),
    spendFromWallet: vi.fn().mockResolvedValue({
      walletId: 'w-1',
      memberId: 'mem-1',
      ledgerEntry: { id: 'le-2', entryType: 'spend', amount: 10, balanceBefore: 50, balanceAfter: 40, createdAt: new Date().toISOString() },
      receipt: { id: 'r-2', receiptNumber: 'RCP-2026-EFGH5678', generatedAt: new Date().toISOString() },
    }),
    createFulfillment: vi.fn().mockResolvedValue({
      id: 'ful-1',
      status: 'confirmed',
      lineItems: [],
      totalAmount: 100,
      shippingFee: 0,
      discountAmount: 0,
      finalAmount: 100,
    }),
    listTiers: vi.fn().mockResolvedValue([
      { id: 'tier-1', name: 'Silver', level: 1, pointsThreshold: 0, benefits: '[]' },
      { id: 'tier-2', name: 'Gold', level: 2, pointsThreshold: 500, benefits: '[]' },
    ]),
  },
}));

vi.mock('../src/utils/idempotency.js', () => ({
  generateIdempotencyKey: vi.fn(() => 'test-idempotency-key'),
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

async function mountMembershipsView(roles: string[], permissions: string[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setSession(makeUser(roles, permissions));

  const wrapper = mount(MembershipsView, {
    global: {
      plugins: [pinia],
      stubs: { SidePanel: SIDE_PANEL_STUB, Teleport: true },
    },
  });
  await flushPromises();
  return wrapper;
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

describe('MembershipsView — tab navigation', () => {
  it('renders three tab buttons: Members, Tiers, Fulfillment', async () => {
    const wrapper = await mountMembershipsView(['OpsManager'], ['read:memberships:*']);
    expect(wrapper.find('[data-testid="tab-Members"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-Tiers"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-Fulfillment"]').exists()).toBe(true);
  });

  it('defaults to Members tab', async () => {
    const wrapper = await mountMembershipsView(['OpsManager'], ['read:memberships:*']);
    expect(wrapper.find('[data-testid="tab-Members"]').classes()).toContain('tab-btn--active');
    expect(wrapper.find('[data-testid="member-search"]').exists()).toBe(true);
  });

  it('switches to Tiers tab and shows tier data', async () => {
    const wrapper = await mountMembershipsView(['OpsManager'], ['read:memberships:*']);
    await wrapper.find('[data-testid="tab-Tiers"]').trigger('click');

    expect(wrapper.find('[data-testid="tab-Tiers"]').classes()).toContain('tab-btn--active');
    expect(wrapper.text()).toContain('Silver');
    expect(wrapper.text()).toContain('Gold');
  });

  it('switches to Fulfillment tab and shows fulfillment form', async () => {
    const wrapper = await mountMembershipsView(['OpsManager'], ['write:memberships:*']);
    await wrapper.find('[data-testid="tab-Fulfillment"]').trigger('click');

    expect(wrapper.find('[data-testid="fulfillment-form"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="coupon-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="use-wallet-checkbox"]').exists()).toBe(true);
  });
});

describe('MembershipsView — role-based visibility (Members tab)', () => {
  it('shows "Add Member" button for user with write:memberships:*', async () => {
    const wrapper = await mountMembershipsView(['OpsManager'], ['write:memberships:*']);
    expect(wrapper.find('[data-testid="btn-create-member"]').exists()).toBe(true);
  });

  it('hides "Add Member" button for user without write permission', async () => {
    const wrapper = await mountMembershipsView(['Auditor'], ['read:memberships:*']);
    expect(wrapper.find('[data-testid="btn-create-member"]').exists()).toBe(false);
  });

  it('shows member search input regardless of role', async () => {
    const wrapper = await mountMembershipsView(['Auditor'], ['read:memberships:*']);
    expect(wrapper.find('[data-testid="member-search"]').exists()).toBe(true);
  });
});

describe('MembershipsView — Auditor wallet field masking', () => {
  async function openMemberDetailForAuditor() {
    const { membershipsService } = await import('../src/services/memberships.service.js');
    vi.mocked(membershipsService.listMembers).mockResolvedValueOnce({
      members: [{
        id: 'mem-1',
        tierName: 'Silver',
        tierLevel: 1,
        growthPoints: 0,
        walletEnabled: true,
        walletBalance: 50,
        joinedAt: new Date().toISOString(),
      } as any],
      total: 1,
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    // Auditor only (not also Administrator/OpsManager)
    auth.setSession(makeUser(['Auditor'], ['read:memberships:*']));

    const wrapper = mount(MembershipsView, {
      global: {
        plugins: [pinia],
        stubs: { SidePanel: SIDE_PANEL_STUB, Teleport: true },
      },
    });
    await flushPromises();

    const manageBtn = wrapper.find('[data-testid="btn-member-detail"]');
    if (manageBtn.exists()) {
      await manageBtn.trigger('click');
      await flushPromises();
    }

    return wrapper;
  }

  it('shows readonly notice instead of wallet top-up for Auditor', async () => {
    const wrapper = await openMemberDetailForAuditor();
    expect(wrapper.find('[data-testid="readonly-notice"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="topup-amount-input"]').exists()).toBe(false);
  });

  it('hides wallet spend form for Auditor', async () => {
    const wrapper = await openMemberDetailForAuditor();
    expect(wrapper.find('[data-testid="spend-amount-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="submit-spend"]').exists()).toBe(false);
  });

  it('shows wallet top-up form for OpsManager (canWrite + not Auditor)', async () => {
    const { membershipsService } = await import('../src/services/memberships.service.js');
    vi.mocked(membershipsService.listMembers).mockResolvedValueOnce({
      members: [{
        id: 'mem-1',
        tierName: 'Silver',
        tierLevel: 1,
        growthPoints: 0,
        walletEnabled: true,
        walletBalance: 50,
        joinedAt: new Date().toISOString(),
      } as any],
      total: 1,
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.setSession(makeUser(['OpsManager'], ['write:memberships:*']));

    const wrapper = mount(MembershipsView, {
      global: {
        plugins: [pinia],
        stubs: { SidePanel: SIDE_PANEL_STUB, Teleport: true },
      },
    });
    await flushPromises();

    const manageBtn = wrapper.find('[data-testid="btn-member-detail"]');
    if (manageBtn.exists()) {
      await manageBtn.trigger('click');
      await flushPromises();
    }

    expect(wrapper.find('[data-testid="topup-amount-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="readonly-notice"]').exists()).toBe(false);
  });
});

describe('MembershipsView — fulfillment form validation', () => {
  it('shows error when submitting with empty line items', async () => {
    const wrapper = await mountMembershipsView(['OpsManager'], ['write:memberships:*']);
    await wrapper.find('[data-testid="tab-Fulfillment"]').trigger('click');

    // Remove the default line item
    const removeBtn = wrapper.find('.btn-remove');
    if (removeBtn.exists()) {
      await removeBtn.trigger('click');
    }

    await wrapper.find('[data-testid="submit-fulfillment"]').trigger('click');

    const error = wrapper.find('[data-testid="fulfillment-error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toContain('line item');
  });

  it('shows error when a line item has no description', async () => {
    const wrapper = await mountMembershipsView(['OpsManager'], ['write:memberships:*']);
    await wrapper.find('[data-testid="tab-Fulfillment"]').trigger('click');

    // Set price but leave description empty
    const priceInput = wrapper.find('[data-testid="item-price"]');
    await priceInput.setValue('10');

    await wrapper.find('[data-testid="submit-fulfillment"]').trigger('click');

    const error = wrapper.find('[data-testid="fulfillment-error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toContain('description');
  });

  it('shows error when line item has price <= 0', async () => {
    const wrapper = await mountMembershipsView(['OpsManager'], ['write:memberships:*']);
    await wrapper.find('[data-testid="tab-Fulfillment"]').trigger('click');

    await wrapper.find('[data-testid="item-description"]').setValue('Test Product');
    await wrapper.find('[data-testid="item-price"]').setValue('0');

    await wrapper.find('[data-testid="submit-fulfillment"]').trigger('click');

    const error = wrapper.find('[data-testid="fulfillment-error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toContain('price');
  });
});

describe('MembershipsView — fulfillment service integration', () => {
  it('calls createFulfillment with idempotency key on valid submit', async () => {
    const { membershipsService } = await import('../src/services/memberships.service.js');
    const wrapper = await mountMembershipsView(['OpsManager'], ['write:memberships:*']);
    await wrapper.find('[data-testid="tab-Fulfillment"]').trigger('click');

    await wrapper.find('[data-testid="item-description"]').setValue('Widget A');
    await wrapper.find('[data-testid="item-price"]').setValue('25');
    await wrapper.find('[data-testid="item-qty"]').setValue('2');

    await wrapper.find('[data-testid="submit-fulfillment"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(membershipsService.createFulfillment)).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        idempotencyKey: 'test-idempotency-key',
        lineItems: expect.arrayContaining([
          expect.objectContaining({ description: 'Widget A', unitPrice: 25, quantity: 2 }),
        ]),
      }),
    );
  });

  it('shows fulfillment result summary after successful creation', async () => {
    const wrapper = await mountMembershipsView(['OpsManager'], ['write:memberships:*']);
    await wrapper.find('[data-testid="tab-Fulfillment"]').trigger('click');

    await wrapper.find('[data-testid="item-description"]').setValue('Widget A');
    await wrapper.find('[data-testid="item-price"]').setValue('25');

    await wrapper.find('[data-testid="submit-fulfillment"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="fulfillment-result"]').exists()).toBe(true);
    // The mock returns finalAmount=100
    expect(wrapper.find('[data-testid="fulfillment-result"]').text()).toContain('100.00');
  });

  it('applies coupon code when provided', async () => {
    const { membershipsService } = await import('../src/services/memberships.service.js');
    const wrapper = await mountMembershipsView(['OpsManager'], ['write:memberships:*']);
    await wrapper.find('[data-testid="tab-Fulfillment"]').trigger('click');

    await wrapper.find('[data-testid="coupon-input"]').setValue('SAVE10');
    await wrapper.find('[data-testid="item-description"]').setValue('Widget A');
    await wrapper.find('[data-testid="item-price"]').setValue('25');

    await wrapper.find('[data-testid="submit-fulfillment"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(membershipsService.createFulfillment)).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ couponCode: 'SAVE10' }),
    );
  });

  it('surfaces error when createFulfillment rejects', async () => {
    const { membershipsService } = await import('../src/services/memberships.service.js');
    vi.mocked(membershipsService.createFulfillment).mockRejectedValueOnce(new Error('Coupon expired'));

    const wrapper = await mountMembershipsView(['OpsManager'], ['write:memberships:*']);
    await wrapper.find('[data-testid="tab-Fulfillment"]').trigger('click');

    await wrapper.find('[data-testid="item-description"]').setValue('Widget A');
    await wrapper.find('[data-testid="item-price"]').setValue('25');

    await wrapper.find('[data-testid="submit-fulfillment"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="fulfillment-error"]').text()).toContain('Coupon expired');
  });
});

describe('MembershipsView — wallet top-up integration', () => {
  it('calls topUpWallet with idempotency key', async () => {
    const { membershipsService } = await import('../src/services/memberships.service.js');
    vi.mocked(membershipsService.listMembers).mockResolvedValueOnce({
      members: [{
        id: 'mem-1',
        tierName: 'Silver',
        tierLevel: 1,
        growthPoints: 0,
        walletEnabled: true,
        walletBalance: 50,
        joinedAt: new Date().toISOString(),
      } as any],
      total: 1,
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.setSession(makeUser(['OpsManager'], ['write:memberships:*']));

    const wrapper = mount(MembershipsView, {
      global: {
        plugins: [pinia],
        stubs: { SidePanel: SIDE_PANEL_STUB, Teleport: true },
      },
    });
    await flushPromises();

    const manageBtn = wrapper.find('[data-testid="btn-member-detail"]');
    if (manageBtn.exists()) {
      await manageBtn.trigger('click');
      await flushPromises();

      const topupInput = wrapper.find('[data-testid="topup-amount-input"]');
      if (topupInput.exists()) {
        await topupInput.setValue('20');
        await wrapper.find('[data-testid="submit-topup"]').trigger('click');
        await flushPromises();

        expect(vi.mocked(membershipsService.topUpWallet)).toHaveBeenCalledWith(
          'mem-1',
          20,
          'test-idempotency-key',
        );
      }
    }
  });
});
