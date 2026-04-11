<template>
  <div class="view" data-testid="fulfillment-view">
    <div class="view-header">
      <h2 class="view-title">Fulfillment &amp; Logistics</h2>
      <div class="header-actions">
        <select v-model="statusFilter" class="filter-select" aria-label="Filter by status" data-testid="status-filter">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="picked">Picked</option>
          <option value="shipped">Shipped</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
          <option value="exception">Exception</option>
        </select>
        <button v-if="canWrite" class="btn btn--primary" @click="openCreate" data-testid="btn-create-shipment">
          + New Shipment
        </button>
        <button class="btn-icon" @click="reload" aria-label="Refresh">↻</button>
      </div>
    </div>

    <LoadingSpinner v-if="isLoading && shipments.length === 0" label="Loading shipments…" />
    <ErrorState v-else-if="listError" :message="listError.message" :on-retry="reload" />

    <AppDataTable
      v-else
      :columns="columns"
      :rows="shipments as any"
      row-key="id"
      :searchable="true"
      search-placeholder="Search tracking number, status…"
      empty-label="No shipments found"
    >
      <template #status="{ value }">
        <span :class="['badge', `badge--${value}`]">{{ value.replace(/_/g,' ') }}</span>
      </template>
      <template #parcels="{ row }">{{ row.parcels?.length ?? 0 }} parcel(s)</template>
      <template #createdAt="{ value }">{{ formatDate(value) }}</template>
      <template #actions="{ row }">
        <button class="btn-sm" @click="openDetail(row)" data-testid="btn-detail">View</button>
      </template>
    </AppDataTable>

    <!-- Create Shipment panel -->
    <SidePanel v-model="createOpen" title="Create Shipment">
      <div class="form" data-testid="create-shipment-form">
        <div class="field">
          <label class="field-label" for="sh-warehouse">Warehouse <span class="required">*</span></label>
          <select id="sh-warehouse" v-model="form.warehouseId" class="input" data-testid="warehouse-select">
            <option value="">Select warehouse…</option>
            <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="sh-carrier">Carrier <span class="required">*</span></label>
          <select id="sh-carrier" v-model="form.carrierId" class="input" data-testid="carrier-select">
            <option value="">Select carrier…</option>
            <option v-for="c in carriers" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="sh-tracking">Tracking Number</label>
          <input id="sh-tracking" v-model="form.trackingNumber" class="input" placeholder="Optional" />
        </div>

        <div class="parcels-section">
          <div class="parcels-header">
            <span class="field-label">Parcels <span class="required">*</span></span>
            <button class="btn-sm" @click="addParcel" type="button">+ Add Parcel</button>
          </div>
          <div
            v-for="(parcel, idx) in form.parcels"
            :key="idx"
            class="parcel-row"
            :data-testid="`parcel-row-${idx}`"
          >
            <input v-model="parcel.description" class="input" placeholder="Description" />
            <input v-model.number="parcel.weightLb" class="input input--sm" type="number" min="0.1" step="0.1" placeholder="lbs" />
            <input v-model.number="parcel.quantity" class="input input--sm" type="number" min="1" placeholder="qty" />
            <button class="btn-remove" @click="form.parcels.splice(idx, 1)" aria-label="Remove parcel">×</button>
          </div>
          <p v-if="form.parcels.length === 0" class="empty-hint">Add at least one parcel.</p>
        </div>

        <p v-if="createError" class="field-error" role="alert" data-testid="create-error">{{ createError }}</p>
      </div>
      <template #footer>
        <button class="btn btn--secondary" @click="createOpen = false">Cancel</button>
        <button
          class="btn btn--primary"
          :disabled="createSubmitting"
          @click="submitCreate"
          data-testid="submit-create-shipment"
        >{{ createSubmitting ? 'Creating…' : 'Create Shipment' }}</button>
      </template>
    </SidePanel>

    <!-- Shipment Detail panel -->
    <SidePanel v-model="detailOpen" title="Shipment Detail">
      <LoadingSpinner v-if="detailLoading" label="Loading shipment…" />
      <div v-else-if="detail" class="detail-body" data-testid="shipment-detail">
        <!-- Status + dates -->
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span :class="['badge', `badge--${detail.status}`]">{{ detail.status.replace(/_/g,' ') }}</span>
        </div>
        <div class="detail-row" v-if="detail.trackingNumber">
          <span class="detail-label">Tracking #</span>
          <span class="detail-val">{{ detail.trackingNumber }}</span>
        </div>
        <div class="detail-row" v-if="detail.shippedAt">
          <span class="detail-label">Shipped</span>
          <span class="detail-val">{{ formatDate(detail.shippedAt) }}</span>
        </div>
        <div class="detail-row" v-if="detail.deliveredAt">
          <span class="detail-label">Delivered</span>
          <span class="detail-val">{{ formatDate(detail.deliveredAt) }}</span>
        </div>

        <!-- Parcels -->
        <h4 class="section-title">Parcels ({{ detail.parcels.length }})</h4>
        <div v-for="p in detail.parcels" :key="p.id" class="parcel-item" data-testid="parcel-item">
          <strong>{{ p.description }}</strong> — {{ p.quantity }}× · {{ p.weightLb }}lb
        </div>
        <EmptyState v-if="detail.parcels.length === 0" label="No parcels" />

        <!-- Tracking history -->
        <h4 class="section-title">Tracking History</h4>
        <AppTimeline :entries="trackingEntries(detail)" />

        <!-- Add tracking update (write roles only) -->
        <template v-if="canWrite">
          <h4 class="section-title">Add Tracking Update</h4>
          <div class="tracking-form">
            <select v-model="trackingStatus" class="input" data-testid="tracking-status-select">
              <option value="">Select status…</option>
              <option value="picked">Picked</option>
              <option value="shipped">Shipped</option>
              <option value="in_transit">In Transit</option>
              <option value="delivered">Delivered</option>
              <option value="exception">Exception</option>
            </select>
            <input v-model="trackingLocation" class="input" placeholder="Location (optional)" data-testid="tracking-location-input" />
            <button
              class="btn btn--primary"
              :disabled="trackingSubmitting || !trackingStatus"
              @click="submitTracking"
              data-testid="submit-tracking"
            >{{ trackingSubmitting ? 'Saving…' : 'Add Update' }}</button>
          </div>
        </template>
      </div>
    </SidePanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import AppDataTable from '../../components/shared/AppDataTable.vue';
import AppTimeline, { type TimelineEntry } from '../../components/shared/AppTimeline.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import SidePanel from '../../components/shared/SidePanel.vue';
import {
  logisticsService,
  type ShipmentResponse,
  type WarehouseResponse,
  type CarrierResponse,
} from '../../services/logistics.service.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { generateIdempotencyKey } from '../../utils/idempotency.js';

const auth = useAuthStore();
const ui = useUiStore();
const canWrite = computed(() => auth.hasPermission('write:logistics:*'));

function getOrgId(): string {
  const orgId = auth.user?.orgId;
  if (!orgId) throw new Error('Organization context is required');
  return orgId;
}

const shipments = ref<ShipmentResponse[]>([]);
const isLoading = ref(false);
const listError = ref<Error | null>(null);
const statusFilter = ref('');

const warehouses = ref<WarehouseResponse[]>([]);
const carriers = ref<CarrierResponse[]>([]);

// Create panel
const createOpen = ref(false);
const createSubmitting = ref(false);
const createError = ref('');
const form = reactive({
  warehouseId: '',
  carrierId: '',
  trackingNumber: '',
  parcels: [] as { description: string; weightLb: number; quantity: number }[],
});

// Detail panel
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<ShipmentResponse | null>(null);
const trackingStatus = ref('');
const trackingLocation = ref('');
const trackingSubmitting = ref(false);

async function fetchShipments() {
  isLoading.value = true;
  listError.value = null;
  try {
    const res = await logisticsService.listShipments(getOrgId(), {
      status: statusFilter.value || undefined,
    });
    shipments.value = res.shipments;
  } catch (e: any) {
    listError.value = e;
  } finally {
    isLoading.value = false;
  }
}

async function loadDropdowns() {
  try {
    const [wh, ca] = await Promise.all([
      logisticsService.listWarehouses(getOrgId()),
      logisticsService.listCarriers(getOrgId()),
    ]);
    warehouses.value = wh;
    carriers.value = ca;
  } catch {
    // Non-fatal — user sees empty selects
  }
}

onMounted(async () => {
  await Promise.all([fetchShipments(), loadDropdowns()]);
});

function reload() { fetchShipments(); }

const columns = [
  { field: 'trackingNumber', header: 'Tracking #', searchFields: ['trackingNumber', 'status'] },
  { field: 'status', header: 'Status', width: '120px' },
  { field: 'parcels', header: 'Parcels', width: '100px' },
  { field: 'createdAt', header: 'Created', width: '130px' },
  { field: 'actions', header: '', width: '70px' },
];

function openCreate() {
  form.warehouseId = '';
  form.carrierId = '';
  form.trackingNumber = '';
  form.parcels = [{ description: '', weightLb: 1, quantity: 1 }];
  createError.value = '';
  createOpen.value = true;
}

function addParcel() {
  form.parcels.push({ description: '', weightLb: 1, quantity: 1 });
}

async function submitCreate() {
  createError.value = '';
  if (!form.warehouseId) { createError.value = 'Warehouse is required.'; return; }
  if (!form.carrierId) { createError.value = 'Carrier is required.'; return; }
  if (form.parcels.length === 0) { createError.value = 'At least one parcel is required.'; return; }
  if (form.parcels.some((p) => !p.description.trim())) { createError.value = 'All parcels need a description.'; return; }

  createSubmitting.value = true;
  try {
    await logisticsService.createShipment(getOrgId(), {
      warehouseId: form.warehouseId,
      carrierId: form.carrierId,
      trackingNumber: form.trackingNumber || undefined,
      parcels: form.parcels,
      idempotencyKey: generateIdempotencyKey(),
    });
    ui.notifySuccess('Shipment created');
    createOpen.value = false;
    reload();
  } catch (e: any) {
    createError.value = e?.message ?? 'Failed to create shipment.';
  } finally {
    createSubmitting.value = false;
  }
}

async function openDetail(shipment: ShipmentResponse) {
  detailOpen.value = true;
  detailLoading.value = true;
  trackingStatus.value = '';
  trackingLocation.value = '';
  try {
    detail.value = await logisticsService.getShipment(shipment.id);
  } catch {
    detail.value = shipment; // fall back to list data
  } finally {
    detailLoading.value = false;
  }
}

async function submitTracking() {
  if (!detail.value || !trackingStatus.value) return;
  trackingSubmitting.value = true;
  try {
    await logisticsService.addTrackingUpdate(
      detail.value.id,
      trackingStatus.value,
      trackingLocation.value || undefined,
    );
    ui.notifySuccess('Tracking update added');
    detail.value = await logisticsService.getShipment(detail.value.id);
    trackingStatus.value = '';
    trackingLocation.value = '';
  } catch (e: any) {
    ui.notifyError('Failed to add tracking update', e?.message);
  } finally {
    trackingSubmitting.value = false;
  }
}

function trackingEntries(s: ShipmentResponse): TimelineEntry[] {
  return (s.tracking ?? []).map((t) => ({
    id: t.id,
    type: t.status,
    content: t.location ? `${t.status} — ${t.location}` : t.status,
    createdAt: t.timestamp,
  }));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
</script>

<style scoped>
.view-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
.view-title { font-size: 1.4rem; font-weight: 700; color: #111827; margin: 0; }
.header-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.filter-select { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.35rem 0.6rem; font-size: 0.85rem; }
.btn { padding: 0.5rem 1rem; border-radius: 4px; border: 1px solid #d1d5db; font-size: 0.875rem; cursor: pointer; font-weight: 500; }
.btn--primary { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }
.btn--secondary { background: #fff; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-icon { background: transparent; border: 1px solid #d1d5db; border-radius: 4px; padding: 0.35rem 0.6rem; cursor: pointer; }
.badge { padding: 0.2rem 0.55rem; border-radius: 12px; font-size: 0.72rem; font-weight: 700; text-transform: capitalize; }
.badge--pending { background: #f3f4f6; color: #374151; }
.badge--picked { background: #dbeafe; color: #1e40af; }
.badge--shipped { background: #e0f2fe; color: #0369a1; }
.badge--in_transit { background: #fef3c7; color: #92400e; }
.badge--delivered { background: #dcfce7; color: #166534; }
.badge--exception { background: #fee2e2; color: #991b1b; }
.btn-sm { font-size: 0.78rem; padding: 0.25rem 0.6rem; border: 1px solid #d1d5db; background: #fff; border-radius: 4px; cursor: pointer; }
.form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.3rem; }
.field-label { font-size: 0.875rem; font-weight: 500; color: #374151; }
.required { color: #ef4444; }
.input { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.5rem 0.7rem; font-size: 0.875rem; width: 100%; box-sizing: border-box; }
.input--sm { max-width: 80px; }
.parcels-section { display: flex; flex-direction: column; gap: 0.5rem; }
.parcels-header { display: flex; align-items: center; justify-content: space-between; }
.parcel-row { display: flex; gap: 0.4rem; align-items: center; }
.btn-remove { background: transparent; border: none; color: #ef4444; font-size: 1.1rem; cursor: pointer; padding: 0 0.25rem; }
.empty-hint { font-size: 0.8rem; color: #9ca3af; }
.field-error { color: #ef4444; font-size: 0.8rem; margin: 0; }
.detail-body { display: flex; flex-direction: column; gap: 0.75rem; }
.detail-row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.9rem; }
.detail-label { color: #6b7280; min-width: 80px; font-weight: 500; }
.detail-val { color: #111827; }
.section-title { font-size: 0.9rem; font-weight: 700; color: #374151; margin: 0.75rem 0 0.4rem; }
.parcel-item { font-size: 0.875rem; color: #374151; background: #f9fafb; border-radius: 4px; padding: 0.4rem 0.6rem; }
.tracking-form { display: flex; flex-direction: column; gap: 0.5rem; }
</style>
