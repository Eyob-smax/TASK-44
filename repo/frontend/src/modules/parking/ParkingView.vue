<template>
  <div class="view" data-testid="parking-view">
    <div class="view-header">
      <h2 class="view-title">Parking Operations</h2>
      <div class="filter-row">
        <select
          v-model="facilityId"
          class="filter-select"
          aria-label="Facility"
          data-testid="facility-filter"
          @change="reload"
        >
          <option value="">All facilities</option>
          <option v-for="facility in facilities" :key="facility.id" :value="facility.id">
            {{ facility.name }}
          </option>
        </select>
        <select v-model="statusFilter" class="filter-select" aria-label="Exception status" data-testid="status-filter">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="escalated">Escalated</option>
          <option value="resolved">Resolved</option>
        </select>
        <select v-model="typeFilter" class="filter-select" aria-label="Exception type" data-testid="type-filter">
          <option value="">All types</option>
          <option value="no_plate">No Plate</option>
          <option value="duplicate_plate">Duplicate Plate</option>
          <option value="overtime">Overtime</option>
          <option value="unsettled">Unsettled</option>
          <option value="inconsistent_entry_exit">Inconsistent Entry/Exit</option>
        </select>
        <button class="btn-icon" @click="reload" aria-label="Refresh">↻</button>
      </div>
    </div>

    <!-- KPI row -->
    <div class="kpi-row">
      <KpiCard
        label="Available Spaces"
        :value="availableSpaces"
        sub="Current capacity"
      />
      <KpiCard
        label="Turnover / Hour"
        :value="turnoverPerHour"
        sub="Completed sessions per hour"
      />
      <KpiCard label="Open Exceptions" :value="openCount" :alert="openCount > 0" />
      <KpiCard label="Escalated" :value="escalatedCount" :alert="escalatedCount > 0" sub="Requiring manager attention" />
      <KpiCard label="Due for Escalation" :value="dueCount" :alert="dueCount > 0" sub="Open > 15 min" />
    </div>

    <LoadingSpinner v-if="isLoading && exceptions.length === 0" label="Loading exceptions…" />
    <ErrorState v-else-if="error" :message="error.message" :on-retry="reload" />

    <AppDataTable
      v-else
      :columns="columns"
      :rows="filteredExceptions as any"
      row-key="id"
      :searchable="true"
      search-placeholder="Search plate, facility, type…"
      empty-label="No parking exceptions matching current filters"
    >
      <template #type="{ value }">
        <span class="type-badge">{{ value.replace(/_/g, ' ') }}</span>
      </template>
      <template #status="{ value }">
        <span :class="['badge', `badge--${value}`]">{{ value }}</span>
      </template>
      <template #isEscalationEligible="{ value, row }">
        <span
          v-if="row.status === 'open' && value"
          class="escalation-indicator"
          data-testid="escalation-due"
          title="This exception has been open more than 15 minutes"
        >⚠ Due</span>
        <span v-else-if="row.status === 'escalated'" class="escalation-escalated">↑ Escalated</span>
        <span v-else>—</span>
      </template>
      <template #minutesSinceCreated="{ value }">{{ value }}m</template>
      <template #actions="{ row }">
        <div class="row-actions" v-if="row.status !== 'resolved'">
          <button
            class="btn-sm btn-sm--primary"
            :disabled="actionInFlight === row.id"
            @click="openResolve(row)"
            data-testid="btn-resolve"
          >Resolve</button>
          <button
            v-if="row.status === 'open' && canEscalate"
            class="btn-sm btn-sm--warn"
            :disabled="actionInFlight === row.id"
            @click="escalate(row.id)"
            data-testid="btn-escalate"
          >Escalate</button>
        </div>
        <span v-else class="resolved-label">✓ Resolved</span>
      </template>
    </AppDataTable>

    <!-- Resolve panel -->
    <SidePanel v-model="resolveOpen" title="Resolve Exception">
      <div v-if="resolveTarget" class="action-form">
        <p class="form-info">
          <span :class="['badge', `badge--${resolveTarget.status}`]">{{ resolveTarget.status }}</span>
          Type: <strong>{{ resolveTarget.type.replace(/_/g, ' ') }}</strong>
        </p>
        <p class="form-meta">
          Plate: <strong>{{ resolveTarget.plateNumber ?? '(no plate)' }}</strong> —
          <span v-if="resolveTarget.isEscalationEligible" class="escalation-indicator">⚠ Escalation due</span>
          <span v-else>{{ resolveTarget.minutesSinceCreated }}m since created</span>
        </p>
        <label class="field-label" for="park-note">Resolution Note <span class="required">*</span></label>
        <textarea
          id="park-note"
          v-model="resolutionNote"
          class="textarea"
          rows="3"
          data-testid="resolution-note-input"
        />
        <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
      </div>
      <template #footer>
        <button class="btn btn--secondary" @click="resolveOpen = false">Cancel</button>
        <button class="btn btn--primary" :disabled="submitting" @click="submitResolve" data-testid="submit-resolve">
          {{ submitting ? 'Resolving…' : 'Confirm' }}
        </button>
      </template>
    </SidePanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import KpiCard from '../../components/shared/KpiCard.vue';
import AppDataTable from '../../components/shared/AppDataTable.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import SidePanel from '../../components/shared/SidePanel.vue';
import {
  parkingService,
  type ParkingExceptionResponse,
  type ParkingFacilityResponse,
  type ParkingStatusResponse,
} from '../../services/parking.service.js';
import { usePolling } from '../../utils/poll.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';

const auth = useAuthStore();
const ui = useUiStore();
const canEscalate = computed(() => auth.hasAnyRole('OpsManager', 'Administrator'));

const exceptions = ref<ParkingExceptionResponse[]>([]);
const facilities = ref<ParkingFacilityResponse[]>([]);
const facilityId = ref('');
const facilityStatus = ref<ParkingStatusResponse | null>(null);
const isLoading = ref(false);
const error = ref<Error | null>(null);
const statusFilter = ref('open');
const typeFilter = ref('');
const actionInFlight = ref<string | null>(null);

const resolveOpen = ref(false);
const resolveTarget = ref<ParkingExceptionResponse | null>(null);
const resolutionNote = ref('');
const formError = ref('');
const submitting = ref(false);

const poll = usePolling(
  async () => {
    const [status, res] = await Promise.all([
      facilityId.value ? parkingService.getFacilityStatus(facilityId.value) : Promise.resolve(null),
      parkingService.listExceptions(
        {
          facilityId: facilityId.value || undefined,
          status: statusFilter.value || undefined,
          type: typeFilter.value || undefined,
        },
        1,
        100,
      ),
    ]);

    facilityStatus.value = status;
    exceptions.value = res.exceptions;
    return res;
  },
  { interval: 15_000, immediate: true },
);

const { data, error: pollError } = poll;
onMounted(async () => {
  try {
    facilities.value = await parkingService.listFacilities();
    if (facilities.value.length > 0) {
      facilityId.value = facilities.value[0]!.id;
    }
  } catch {
    // Keep page usable even if facility list fails.
  }
  poll.start();
});

function reload() { poll.start(); }

const filteredExceptions = computed(() => exceptions.value as any[]);

const openCount = computed(() => exceptions.value.filter((e) => e.status === 'open').length);
const escalatedCount = computed(() => exceptions.value.filter((e) => e.status === 'escalated').length);
const dueCount = computed(() => exceptions.value.filter((e) => e.status === 'open' && e.isEscalationEligible).length);
const availableSpaces = computed(() => facilityStatus.value?.availableSpaces ?? '—');
const turnoverPerHour = computed(() => facilityStatus.value?.turnoverPerHour ?? '—');

const columns = [
  { field: 'facilityName', header: 'Facility', searchFields: ['facilityName', 'plateNumber', 'type'] },
  { field: 'type', header: 'Type' },
  { field: 'plateNumber', header: 'Plate', width: '110px' },
  { field: 'status', header: 'Status', width: '100px' },
  { field: 'minutesSinceCreated', header: 'Age', width: '70px' },
  { field: 'isEscalationEligible', header: 'Escalation', width: '120px' },
  { field: 'actions', header: '', width: '160px' },
];

function openResolve(exc: ParkingExceptionResponse) {
  resolveTarget.value = exc;
  resolutionNote.value = '';
  formError.value = '';
  resolveOpen.value = true;
}

async function submitResolve() {
  if (!resolveTarget.value) return;
  if (!resolutionNote.value.trim()) {
    formError.value = 'Resolution note is required.';
    return;
  }
  submitting.value = true;
  formError.value = '';
  try {
    await parkingService.resolveException(resolveTarget.value.id, resolutionNote.value.trim());
    ui.notifySuccess('Exception resolved');
    resolveOpen.value = false;
    reload();
  } catch (e: any) {
    ui.notifyError('Failed to resolve', e?.message);
  } finally {
    submitting.value = false;
  }
}

async function escalate(id: string) {
  actionInFlight.value = id;
  try {
    await parkingService.escalateException(id);
    ui.notifySuccess('Exception escalated');
    reload();
  } catch (e: any) {
    ui.notifyError('Failed to escalate', e?.message);
  } finally {
    actionInFlight.value = null;
  }
}
</script>

<style scoped>
.view-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
.view-title { font-size: 1.4rem; font-weight: 700; color: #111827; margin: 0; }
.filter-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.filter-select { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.35rem 0.6rem; font-size: 0.85rem; }
.btn-icon { background: transparent; border: 1px solid #d1d5db; border-radius: 4px; padding: 0.35rem 0.6rem; cursor: pointer; }
.kpi-row { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
.badge { padding: 0.2rem 0.55rem; border-radius: 12px; font-size: 0.72rem; font-weight: 700; text-transform: capitalize; }
.badge--open { background: #fee2e2; color: #991b1b; }
.badge--escalated { background: #f3e8ff; color: #6b21a8; }
.badge--resolved { background: #dcfce7; color: #166534; }
.type-badge { font-size: 0.78rem; color: #374151; }
.escalation-indicator { color: #ef4444; font-weight: 700; font-size: 0.8rem; }
.escalation-escalated { color: #6b21a8; font-size: 0.8rem; }
.row-actions { display: flex; gap: 0.35rem; }
.btn-sm { font-size: 0.78rem; padding: 0.25rem 0.55rem; border-radius: 4px; cursor: pointer; border: 1px solid #d1d5db; background: #fff; white-space: nowrap; }
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm--primary { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }
.btn-sm--warn { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
.resolved-label { font-size: 0.78rem; color: #166534; }
.action-form { display: flex; flex-direction: column; gap: 0.75rem; }
.form-info { font-size: 0.9rem; color: #374151; display: flex; align-items: center; gap: 0.5rem; }
.form-meta { font-size: 0.85rem; color: #6b7280; }
.field-label { font-size: 0.875rem; font-weight: 500; }
.required { color: #ef4444; }
.textarea { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.55rem 0.75rem; font-size: 0.875rem; width: 100%; resize: vertical; box-sizing: border-box; }
.field-error { color: #ef4444; font-size: 0.8rem; margin: 0; }
.btn { padding: 0.5rem 1rem; border-radius: 4px; border: 1px solid #d1d5db; font-size: 0.875rem; cursor: pointer; }
.btn--secondary { background: #fff; }
.btn--primary { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
