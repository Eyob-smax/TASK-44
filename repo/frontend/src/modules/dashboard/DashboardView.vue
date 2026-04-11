<template>
  <div class="view" data-testid="dashboard-view">
    <div class="view-header">
      <h2 class="view-title">Operational Dashboard</h2>
      <div class="time-toggle" role="group" aria-label="Time range">
        <button
          v-for="opt in TIME_OPTIONS"
          :key="opt.value"
          :class="['toggle-btn', { 'toggle-btn--active': timeRange === opt.value }]"
          @click="setTimeRange(opt.value)"
          :data-testid="`time-toggle-${opt.value}`"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <LoadingSpinner v-if="initLoading" label="Loading dashboard context…" />
    <ErrorState v-else-if="initError" :message="initError.message" :on-retry="initialize" />
    <LoadingSpinner v-else-if="isLoading && !data" label="Loading dashboard…" />
    <ErrorState v-else-if="error" :message="error.message" :on-retry="reload" />

    <template v-else-if="data">
      <!-- KPI row -->
      <div class="kpi-row">
        <KpiCard label="Online Classrooms" :value="onlineCount" :sub="`of ${data.length} total`" />
        <KpiCard
          label="Open Anomalies"
          :value="totalOpenAnomalies"
          :alert="totalOpenAnomalies > 0"
          sub="Requiring attention"
        />
        <KpiCard
          label="Offline Classrooms"
          :value="offlineCount"
          :alert="offlineCount > 0"
          sub="No heartbeat"
        />
        <KpiCard
          label="Avg Confidence"
          :value="avgConfidence !== null ? `${(avgConfidence * 100).toFixed(0)}%` : '—'"
          :alert="avgConfidence !== null && avgConfidence < 0.7"
          sub="Recognition score"
        />
      </div>

      <!-- Anomaly filter bar -->
      <div class="section-header">
        <h3 class="section-title">Classroom Status</h3>
        <div class="filter-row">
          <select
            v-model="campusId"
            class="filter-select"
            aria-label="Filter by campus"
            data-testid="campus-filter"
            @change="reload"
          >
            <option value="" disabled>Select campus</option>
            <option v-for="campus in campuses" :key="campus.id" :value="campus.id">{{ campus.name }}</option>
          </select>
          <select
            v-model="statusFilter"
            class="filter-select"
            aria-label="Filter by classroom status"
            data-testid="status-filter"
          >
            <option value="">All statuses</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="degraded">Degraded</option>
          </select>
          <button class="btn-icon" @click="reload" aria-label="Refresh" title="Refresh">↻</button>
        </div>
      </div>

      <AppDataTable
        :columns="columns"
        :rows="filteredClassrooms as any"
        row-key="id"
        :searchable="true"
        search-placeholder="Search classrooms…"
        empty-label="No classrooms match the selected filters"
      >
        <template #status="{ value }">
          <span :class="['status-badge', `status-badge--${value}`]">{{ value }}</span>
        </template>
        <template #latestConfidence="{ value }">
          <span :class="{ 'conf-low': value !== null && value < 0.7 }">
            {{ value !== null ? `${(value * 100).toFixed(0)}%` : '—' }}
          </span>
        </template>
        <template #openAnomalyCount="{ value }">
          <span :class="{ 'text-alert': Number(value) > 0 }">{{ value }}</span>
        </template>
        <template #lastHeartbeatAt="{ value }">
          {{ value ? formatRelative(value) : '—' }}
        </template>
      </AppDataTable>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import KpiCard from '../../components/shared/KpiCard.vue';
import AppDataTable from '../../components/shared/AppDataTable.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import { classroomOpsService, type DashboardClassroomResponse } from '../../services/classroom-ops.service.js';
import { masterDataService, type CampusResponse } from '../../services/master-data.service.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { usePolling } from '../../utils/poll.js';

type TimeRange = 'now' | '7d' | '30d';

const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
];

const timeRange = ref<TimeRange>('now');
const statusFilter = ref('');
const classrooms = ref<DashboardClassroomResponse[]>([]);
const campuses = ref<CampusResponse[]>([]);
const campusId = ref('');
const initError = ref<Error | null>(null);
const initLoading = ref(true);
const auth = useAuthStore();

const poll = usePolling(
  async () => {
    if (!campusId.value) {
      classrooms.value = [];
      return [];
    }
    const result = await classroomOpsService.getDashboard(campusId.value);
    classrooms.value = result;
    return result;
  },
  { interval: 30_000, immediate: false },
);

const { data, error, isLoading } = poll;

async function initialize() {
  initError.value = null;
  initLoading.value = true;
  try {
    const orgId = auth.user?.orgId;
    if (!orgId) {
      throw new Error('Organization context is required to load dashboard');
    }
    campuses.value = await masterDataService.listCampuses(orgId);
    if (campuses.value.length === 0) {
      throw new Error('No campuses are configured for this organization');
    }
    if (!campusId.value) {
      campusId.value = campuses.value[0]!.id;
    }
    await poll.start();
  } catch (e: any) {
    initError.value = e;
  } finally {
    initLoading.value = false;
  }
}

onMounted(() => { initialize(); });

function setTimeRange(r: TimeRange) {
  timeRange.value = r;
  // The classroom dashboard is always current state; timeRange affects display label only.
  // Full time-range API support in anomaly queries is a backend capability already in place.
}

function reload() {
  if (!campusId.value) return;
  poll.start();
}

const filteredClassrooms = computed(() => {
  const rows = classrooms.value;
  if (!statusFilter.value) return rows;
  return rows.filter((c) => c.status === statusFilter.value);
});

const onlineCount = computed(() => classrooms.value.filter((c) => c.status === 'online').length);
const offlineCount = computed(() => classrooms.value.filter((c) => c.status === 'offline').length);
const totalOpenAnomalies = computed(() =>
  classrooms.value.reduce((sum, c) => sum + c.openAnomalyCount, 0),
);
const avgConfidence = computed(() => {
  const withData = classrooms.value.filter((c) => c.latestConfidence !== null);
  if (withData.length === 0) return null;
  return withData.reduce((sum, c) => sum + c.latestConfidence!, 0) / withData.length;
});

const columns = [
  { field: 'name', header: 'Classroom' },
  { field: 'building', header: 'Building' },
  { field: 'status', header: 'Status', width: '100px' },
  { field: 'latestConfidence', header: 'Confidence', width: '110px' },
  { field: 'openAnomalyCount', header: 'Anomalies', width: '100px' },
  { field: 'lastHeartbeatAt', header: 'Last Heartbeat' },
];

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
.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  gap: 1rem;
  flex-wrap: wrap;
}
.view-title { font-size: 1.4rem; font-weight: 700; color: #111827; margin: 0; }
.time-toggle {
  display: flex;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 3px;
  gap: 2px;
}
.toggle-btn {
  border: none;
  background: transparent;
  padding: 0.3rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  color: #6b7280;
  transition: background 0.15s, color 0.15s;
}
.toggle-btn--active { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.kpi-row { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.section-title { font-size: 1rem; font-weight: 700; color: #374151; margin: 0; }
.filter-row { display: flex; align-items: center; gap: 0.5rem; }
.filter-select { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.35rem 0.6rem; font-size: 0.85rem; }
.btn-icon { background: transparent; border: 1px solid #d1d5db; border-radius: 4px; padding: 0.35rem 0.6rem; cursor: pointer; font-size: 1rem; }
.status-badge { padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
.status-badge--online  { background: #dcfce7; color: #166534; }
.status-badge--offline { background: #fee2e2; color: #991b1b; }
.status-badge--degraded { background: #fef3c7; color: #92400e; }
.conf-low { color: #ef4444; font-weight: 700; }
.text-alert { color: #ef4444; font-weight: 700; }
</style>
