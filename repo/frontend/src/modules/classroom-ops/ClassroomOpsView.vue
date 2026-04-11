<template>
  <div class="view" data-testid="classroom-ops-view">
    <div class="view-header">
      <h2 class="view-title">Classroom Ops — Anomaly Stream</h2>
      <div class="filter-row">
        <select v-model="severityFilter" class="filter-select" aria-label="Severity filter" data-testid="severity-filter">
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select v-model="statusFilter" class="filter-select" aria-label="Status filter" data-testid="status-filter">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="assigned">Assigned</option>
          <option value="resolved">Resolved</option>
        </select>
        <button class="btn-icon" @click="reload" aria-label="Refresh">↻</button>
      </div>
    </div>

    <LoadingSpinner v-if="isLoading && anomalies.length === 0" label="Loading anomalies…" />
    <ErrorState v-else-if="error" :message="error.message" :on-retry="reload" />

    <AppDataTable
      v-else
      :columns="columns"
      :rows="filteredAnomalies as any"
      row-key="id"
      :searchable="true"
      search-placeholder="Search classrooms or types…"
      empty-label="No anomalies matching current filters"
    >
      <template #severity="{ value }">
        <span :class="['badge', `badge--${value}`]">{{ value }}</span>
      </template>
      <template #status="{ value }">
        <span :class="['badge', `badge--status-${value}`]">{{ value }}</span>
      </template>
      <template #detectedAt="{ value }">{{ formatRelative(value) }}</template>
      <template #actions="{ row }">
        <div class="row-actions" v-if="canWrite">
          <button
            v-if="row.status === 'open'"
            class="btn-sm"
            :disabled="actionInFlight === row.id"
            @click="acknowledge(row.id)"
            :data-testid="`ack-${row.id}`"
          >Ack</button>
          <button
            v-if="row.status === 'open' || row.status === 'acknowledged'"
            class="btn-sm"
            :disabled="actionInFlight === row.id"
            @click="openAssign(row)"
          >Assign</button>
          <button
            v-if="row.status !== 'resolved'"
            class="btn-sm btn-sm--primary"
            :disabled="actionInFlight === row.id"
            @click="openResolve(row)"
            :data-testid="`resolve-${row.id}`"
          >Resolve</button>
        </div>
        <span v-else class="readonly-label">read-only</span>
      </template>
    </AppDataTable>

    <!-- Resolve panel -->
    <SidePanel v-model="resolveOpen" title="Resolve Anomaly">
      <div v-if="activeTarget" class="action-form">
        <p class="form-info">
          <span :class="['badge', `badge--${activeTarget.severity}`]">{{ activeTarget.severity }}</span>
          <strong>{{ activeTarget.type.replace(/_/g, ' ') }}</strong> —
          {{ activeTarget.classroomName }}
        </p>
        <label class="field-label" for="res-note">
          Resolution Note <span class="required">*</span>
        </label>
        <textarea
          id="res-note"
          v-model="resolutionNote"
          class="textarea"
          rows="4"
          placeholder="Describe what was done to resolve this anomaly…"
          data-testid="resolution-note-input"
        />
        <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
      </div>
      <template #footer>
        <button class="btn btn--secondary" @click="resolveOpen = false">Cancel</button>
        <button
          class="btn btn--primary"
          :disabled="submitting"
          @click="submitResolve"
          data-testid="submit-resolve"
        >{{ submitting ? 'Resolving…' : 'Confirm Resolve' }}</button>
      </template>
    </SidePanel>

    <!-- Assign panel -->
    <SidePanel v-model="assignOpen" title="Assign Anomaly">
      <div v-if="activeTarget" class="action-form">
        <p class="form-info">
          Assigning <strong>{{ activeTarget.type.replace(/_/g, ' ') }}</strong> on
          <strong>{{ activeTarget.classroomName }}</strong>
        </p>
        <label class="field-label" for="assign-user">Assign To (User ID)</label>
        <input
          id="assign-user"
          v-model="assignUserId"
          class="input"
          placeholder="Enter user ID…"
          data-testid="assign-user-input"
        />
        <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
      </div>
      <template #footer>
        <button class="btn btn--secondary" @click="assignOpen = false">Cancel</button>
        <button
          class="btn btn--primary"
          :disabled="submitting"
          @click="submitAssign"
          data-testid="submit-assign"
        >{{ submitting ? 'Assigning…' : 'Assign' }}</button>
      </template>
    </SidePanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppDataTable from '../../components/shared/AppDataTable.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import SidePanel from '../../components/shared/SidePanel.vue';
import { classroomOpsService, type AnomalyEventResponse } from '../../services/classroom-ops.service.js';
import { usePolling } from '../../utils/poll.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';

const auth = useAuthStore();
const ui = useUiStore();

// Auditor and ClassroomSupervisor can read; write actions require write permission
const canWrite = computed(() => auth.hasPermission('write:classroom-ops:*'));

const anomalies = ref<AnomalyEventResponse[]>([]);
const isLoading = ref(false);
const error = ref<Error | null>(null);
const severityFilter = ref('');
const statusFilter = ref('');
const actionInFlight = ref<string | null>(null);

// Panels
const resolveOpen = ref(false);
const assignOpen = ref(false);
const activeTarget = ref<AnomalyEventResponse | null>(null);
const resolutionNote = ref('');
const assignUserId = ref('');
const formError = ref('');
const submitting = ref(false);

const poll = usePolling(
  async () => {
    const res = await classroomOpsService.listAnomalies(
      {
        severity: severityFilter.value || undefined,
        status: statusFilter.value || undefined,
      },
      1,
      100,
    );
    anomalies.value = res.anomalies;
    return res;
  },
  { interval: 20_000, immediate: true },
);

const { data, error: pollError } = poll;
onMounted(() => poll.start());

function reload() {
  error.value = null;
  poll.start();
}

const filteredAnomalies = computed(() => anomalies.value as any[]);

const columns = [
  { field: 'classroomName', header: 'Classroom', searchFields: ['classroomName', 'type'] },
  { field: 'type', header: 'Type' },
  { field: 'severity', header: 'Severity', width: '90px' },
  { field: 'status', header: 'Status', width: '120px' },
  { field: 'detectedAt', header: 'Detected', width: '130px' },
  { field: 'actions', header: '', width: '200px' },
];

async function acknowledge(id: string) {
  actionInFlight.value = id;
  try {
    await classroomOpsService.acknowledge(id);
    ui.notifySuccess('Anomaly acknowledged');
    reload();
  } catch (e: any) {
    ui.notifyError('Failed to acknowledge', e?.message);
  } finally {
    actionInFlight.value = null;
  }
}

function openResolve(anomaly: AnomalyEventResponse) {
  activeTarget.value = anomaly;
  resolutionNote.value = '';
  formError.value = '';
  resolveOpen.value = true;
}

async function submitResolve() {
  if (!activeTarget.value) return;
  if (!resolutionNote.value.trim()) {
    formError.value = 'Resolution note is required and cannot be empty.';
    return;
  }
  submitting.value = true;
  formError.value = '';
  try {
    await classroomOpsService.resolve(activeTarget.value.id, resolutionNote.value.trim());
    ui.notifySuccess('Anomaly resolved');
    resolveOpen.value = false;
    reload();
  } catch (e: any) {
    ui.notifyError('Failed to resolve', e?.message);
  } finally {
    submitting.value = false;
  }
}

function openAssign(anomaly: AnomalyEventResponse) {
  activeTarget.value = anomaly;
  assignUserId.value = '';
  formError.value = '';
  assignOpen.value = true;
}

async function submitAssign() {
  if (!activeTarget.value) return;
  if (!assignUserId.value.trim()) {
    formError.value = 'User ID is required.';
    return;
  }
  submitting.value = true;
  formError.value = '';
  try {
    await classroomOpsService.assign(activeTarget.value.id, assignUserId.value.trim());
    ui.notifySuccess('Anomaly assigned');
    assignOpen.value = false;
    reload();
  } catch (e: any) {
    ui.notifyError('Failed to assign', e?.message);
  } finally {
    submitting.value = false;
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
</script>

<style scoped>
.view-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
.view-title { font-size: 1.4rem; font-weight: 700; color: #111827; margin: 0; }
.filter-row { display: flex; align-items: center; gap: 0.5rem; }
.filter-select { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.35rem 0.6rem; font-size: 0.85rem; }
.btn-icon { background: transparent; border: 1px solid #d1d5db; border-radius: 4px; padding: 0.35rem 0.6rem; cursor: pointer; }
.badge { padding: 0.2rem 0.55rem; border-radius: 12px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
.badge--high { background: #fee2e2; color: #991b1b; }
.badge--medium { background: #fef3c7; color: #92400e; }
.badge--low { background: #dbeafe; color: #1e40af; }
.badge--critical { background: #f3e8ff; color: #6b21a8; }
.badge--status-open { background: #fee2e2; color: #991b1b; }
.badge--status-acknowledged { background: #fef3c7; color: #92400e; }
.badge--status-assigned { background: #dbeafe; color: #1e40af; }
.badge--status-resolved { background: #dcfce7; color: #166534; }
.row-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.btn-sm { font-size: 0.78rem; padding: 0.25rem 0.55rem; border: 1px solid #d1d5db; background: #fff; border-radius: 4px; cursor: pointer; white-space: nowrap; }
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm--primary { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }
.readonly-label { font-size: 0.75rem; color: #9ca3af; font-style: italic; }
.action-form { display: flex; flex-direction: column; gap: 0.75rem; }
.form-info { font-size: 0.9rem; color: #374151; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.field-label { font-size: 0.875rem; font-weight: 500; color: #374151; }
.required { color: #ef4444; }
.textarea { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.55rem 0.75rem; font-size: 0.875rem; width: 100%; resize: vertical; box-sizing: border-box; }
.input { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.55rem 0.75rem; font-size: 0.875rem; width: 100%; box-sizing: border-box; }
.field-error { color: #ef4444; font-size: 0.8rem; margin: 0; }
.btn { padding: 0.5rem 1rem; border-radius: 4px; border: 1px solid #d1d5db; font-size: 0.875rem; cursor: pointer; }
.btn--secondary { background: #fff; }
.btn--primary { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
