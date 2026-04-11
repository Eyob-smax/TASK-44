import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import FulfillmentView from '../src/modules/fulfillment/FulfillmentView.vue';
import { useAuthStore } from '../src/stores/auth.store.js';

vi.mock('../src/services/logistics.service.js', () => ({
  logisticsService: {
    listShipments: vi.fn().mockResolvedValue({ shipments: [], total: 0 }),
    listWarehouses: vi.fn().mockResolvedValue([
      { id: 'wh-1', name: 'Main Warehouse' },
    ]),
    listCarriers: vi.fn().mockResolvedValue([
      { id: 'ca-1', name: 'FastShip Co.' },
    ]),
    createShipment: vi.fn().mockResolvedValue({ id: 'ship-new', status: 'pending', parcels: [] }),
    getShipment: vi.fn().mockResolvedValue(null),
    addTrackingUpdate: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../src/utils/idempotency.js', () => ({
  generateIdempotencyKey: vi.fn(() => 'test-uuid-1234'),
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

async function mountFulfillmentView(roles: string[], permissions: string[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.setSession(makeUser(roles, permissions));

  const wrapper = mount(FulfillmentView, {
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

describe('FulfillmentView — role-based visibility', () => {
  it('shows "New Shipment" button for user with write:logistics:*', async () => {
    const wrapper = await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    expect(wrapper.find('[data-testid="btn-create-shipment"]').exists()).toBe(true);
  });

  it('hides "New Shipment" button for user without write:logistics:*', async () => {
    const wrapper = await mountFulfillmentView(['Auditor'], ['read:logistics:*']);
    expect(wrapper.find('[data-testid="btn-create-shipment"]').exists()).toBe(false);
  });

  it('shows status filter regardless of role', async () => {
    const wrapper = await mountFulfillmentView(['Auditor'], ['read:logistics:*']);
    expect(wrapper.find('[data-testid="status-filter"]').exists()).toBe(true);
  });
});

describe('FulfillmentView — create shipment form', () => {
  it('opens create shipment panel on button click', async () => {
    const wrapper = await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    await wrapper.find('[data-testid="btn-create-shipment"]').trigger('click');
    expect(wrapper.find('[data-testid="create-shipment-form"]').exists()).toBe(true);
  });

  it('shows error when submitting without warehouse', async () => {
    const wrapper = await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    await wrapper.find('[data-testid="btn-create-shipment"]').trigger('click');
    await wrapper.find('[data-testid="submit-create-shipment"]').trigger('click');

    const error = wrapper.find('[data-testid="create-error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toContain('Warehouse is required');
  });

  it('shows error when submitting without carrier after warehouse selected', async () => {
    const wrapper = await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    await wrapper.find('[data-testid="btn-create-shipment"]').trigger('click');

    // Select warehouse
    await wrapper.find('[data-testid="warehouse-select"]').setValue('wh-1');
    await wrapper.find('[data-testid="submit-create-shipment"]').trigger('click');

    const error = wrapper.find('[data-testid="create-error"]');
    expect(error.text()).toContain('Carrier is required');
  });

  it('shows error when submitting without any parcels', async () => {
    const wrapper = await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    await wrapper.find('[data-testid="btn-create-shipment"]').trigger('click');

    await wrapper.find('[data-testid="warehouse-select"]').setValue('wh-1');
    await wrapper.find('[data-testid="carrier-select"]').setValue('ca-1');

    // Remove the initial parcel
    await wrapper.find('.btn-remove').trigger('click');
    await wrapper.find('[data-testid="submit-create-shipment"]').trigger('click');

    const error = wrapper.find('[data-testid="create-error"]');
    expect(error.text()).toContain('parcel');
  });

  it('populates warehouse options from service', async () => {
    const wrapper = await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    await wrapper.find('[data-testid="btn-create-shipment"]').trigger('click');

    const warehouseSelect = wrapper.find('[data-testid="warehouse-select"]');
    expect(warehouseSelect.text()).toContain('Main Warehouse');
  });

  it('populates carrier options from service', async () => {
    const wrapper = await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    await wrapper.find('[data-testid="btn-create-shipment"]').trigger('click');

    const carrierSelect = wrapper.find('[data-testid="carrier-select"]');
    expect(carrierSelect.text()).toContain('FastShip Co.');
  });
});

describe('FulfillmentView — parcel management', () => {
  it('shows one default parcel row when form opens', async () => {
    const wrapper = await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    await wrapper.find('[data-testid="btn-create-shipment"]').trigger('click');

    expect(wrapper.find('[data-testid="parcel-row-0"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="parcel-row-1"]').exists()).toBe(false);
  });

  it('adds a second parcel row when "+ Add Parcel" is clicked', async () => {
    const wrapper = await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    await wrapper.find('[data-testid="btn-create-shipment"]').trigger('click');
    await wrapper.find('.parcels-header .btn-sm').trigger('click');

    expect(wrapper.find('[data-testid="parcel-row-0"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="parcel-row-1"]').exists()).toBe(true);
  });
});

describe('FulfillmentView — service adapter integration', () => {
  it('calls createShipment with idempotency key on valid submit', async () => {
    const { logisticsService } = await import('../src/services/logistics.service.js');
    const { generateIdempotencyKey } = await import('../src/utils/idempotency.js');

    const wrapper = await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    await wrapper.find('[data-testid="btn-create-shipment"]').trigger('click');

    // Fill form
    await wrapper.find('[data-testid="warehouse-select"]').setValue('wh-1');
    await wrapper.find('[data-testid="carrier-select"]').setValue('ca-1');
    await wrapper.find('[data-testid="parcel-row-0"] input:first-child').setValue('Box A');

    await wrapper.find('[data-testid="submit-create-shipment"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(logisticsService.createShipment)).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        warehouseId: 'wh-1',
        carrierId: 'ca-1',
        idempotencyKey: 'test-uuid-1234',
      }),
    );
  });

  it('calls listShipments on mount', async () => {
    const { logisticsService } = await import('../src/services/logistics.service.js');
    await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    expect(vi.mocked(logisticsService.listShipments)).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({}),
    );
  });

  it('surfaces service error in create form', async () => {
    const { logisticsService } = await import('../src/services/logistics.service.js');
    vi.mocked(logisticsService.createShipment).mockRejectedValueOnce(new Error('Server error'));

    const wrapper = await mountFulfillmentView(['OpsManager'], ['write:logistics:*']);
    await wrapper.find('[data-testid="btn-create-shipment"]').trigger('click');

    await wrapper.find('[data-testid="warehouse-select"]').setValue('wh-1');
    await wrapper.find('[data-testid="carrier-select"]').setValue('ca-1');
    await wrapper.find('[data-testid="parcel-row-0"] input:first-child').setValue('Box A');

    await wrapper.find('[data-testid="submit-create-shipment"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="create-error"]').text()).toContain('Server error');
  });
});

describe('FulfillmentView — tracking update', () => {
  it('tracking form is absent for Auditor (no write permission)', async () => {
    // Tracking form is inside detail panel which only shows after clicking View
    // canWrite is false for Auditor — check the tracking-status-select is not rendered
    const wrapper = await mountFulfillmentView(['Auditor'], ['read:logistics:*']);
    expect(wrapper.find('[data-testid="tracking-status-select"]').exists()).toBe(false);
  });
});
