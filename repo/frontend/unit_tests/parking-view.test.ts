import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ParkingView from '../src/modules/parking/ParkingView.vue';
import { useAuthStore } from '../src/stores/auth.store.js';

vi.mock('../src/services/parking.service.js', () => ({
  parkingService: {
    listFacilities: vi.fn().mockResolvedValue([
      { id: 'facility-1', campusId: 'campus-1', name: 'Lot A', totalSpaces: 120 },
    ]),
    getFacilityStatus: vi.fn().mockResolvedValue({
      facilityId: 'facility-1',
      facilityName: 'Lot A',
      totalSpaces: 120,
      occupiedSpaces: 50,
      availableSpaces: 70,
      turnoverPerHour: 0.5,
      openExceptions: 1,
      escalatedExceptions: 0,
    }),
    listExceptions: vi.fn().mockResolvedValue({ exceptions: [], total: 0 }),
    resolveException: vi.fn().mockResolvedValue({}),
    escalateException: vi.fn().mockResolvedValue({}),
  },
}));

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const auth = useAuthStore();
  auth.setSession({
    token: 'token',
    permissions: ['read:parking:*', 'write:parking:*'],
    user: {
      id: 'u1',
      username: 'ops',
      displayName: 'Ops',
      orgId: 'org-1',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      roles: [{ id: 'role-opsmanager', name: 'OpsManager' }],
    },
  });

  const wrapper = mount(ParkingView, {
    global: {
      plugins: [pinia],
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

describe('ParkingView unsettled filter', () => {
  it('renders unsettled exception type option', async () => {
    const wrapper = await mountView();

    const typeFilter = wrapper.find('[data-testid="type-filter"]');
    const options = typeFilter.findAll('option');
    const unsettled = options.find((o) => (o.element as HTMLOptionElement).value === 'unsettled');

    expect(unsettled).toBeDefined();
    expect(unsettled?.text()).toBe('Unsettled');
  });

  it('requests unsettled exceptions when unsettled filter is selected', async () => {
    const { parkingService } = await import('../src/services/parking.service.js');
    const wrapper = await mountView();

    vi.mocked(parkingService.listExceptions).mockClear();

    const typeFilter = wrapper.find('[data-testid="type-filter"]');
    await typeFilter.setValue('unsettled');
    await wrapper.find('button[aria-label="Refresh"]').trigger('click');
    await flushPromises();

    expect(vi.mocked(parkingService.listExceptions)).toHaveBeenCalled();
    const lastCall = vi.mocked(parkingService.listExceptions).mock.calls.at(-1);
    expect(lastCall?.[0]).toMatchObject({ type: 'unsettled' });
  });
});
