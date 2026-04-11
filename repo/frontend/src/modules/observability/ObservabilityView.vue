<template>
  <div class="view" data-testid="observability-view">
    <div class="view-header">
      <h2 class="view-title">Observability</h2>
      <div class="tab-bar" role="tablist">
        <button
          v-for="tab in TABS"
          :key="tab"
          :class="['tab-btn', { 'tab-btn--active': activeTab === tab }]"
          role="tab"
          @click="activeTab = tab"
          :data-testid="`tab-${tab.toLowerCase()}`"
        >{{ tab }}</button>
      </div>
    </div>

    <!-- Metrics tab -->
    <template v-if="activeTab === 'Metrics'">
      <LoadingSpinner v-if="metricsLoading" label="Loading metrics…" />
      <ErrorState v-else-if="metricsError" :message="metricsError.message" :on-retry="loadMetrics" />
      <template v-else-if="metrics">
        <div class="kpi-grid" data-testid="metrics-grid">
          <div data-testid="kpi-p95">
            <KpiCard label="P95 Latency" :value="metrics.p95Latency !== null ? `${metrics.p95Latency} ms` : '—'" />
          </div>
          <div data-testid="kpi-cpu">
            <KpiCard label="CPU Utilization" :value="metrics.cpuUtilization !== null ? `${metrics.cpuUtilization}%` : '—'" />
          </div>
          <div data-testid="kpi-gpu">
            <KpiCard label="GPU Utilization" :value="metrics.gpuUtilization !== null ? `${metrics.gpuUtilization}%` : '—'" />
          </div>
          <div data-testid="kpi-error-rate">
            <KpiCard label="Error Rate" :value="metrics.errorRate !== null ? `${metrics.errorRate}%` : '—'" />
          </div>
        </div>
        <p class="metric-timestamp" v-if="metrics.collectedAt">
          Last collected: {{ formatDate(metrics.collectedAt) }}
        </p>
      </template>
    </template>

    <!-- Logs tab -->
    <template v-else-if="activeTab === 'Logs'">
      <div class="filter-row">
        <select v-model="logLevel" class="filter-select" aria-label="Log level" data-testid="log-level-filter">
          <option value="">All levels</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <input
          v-model="logSearch"
          class="search-input"
          placeholder="Search messages…"
          data-testid="log-search"
        />
        <button class="btn-icon" @click="loadLogs" aria-label="Refresh">↻</button>
      </div>
      <LoadingSpinner v-if="logsLoading" label="Loading logs…" />
      <ErrorState v-else-if="logsError" :message="logsError.message" :on-retry="loadLogs" />
      <AppDataTable
        v-else
        :columns="logColumns"
        :rows="logs as any"
        row-key="id"
        :searchable="false"
        empty-label="No log entries found"
        data-testid="logs-table"
      >
        <template #level="{ value }">
          <span :class="['log-badge', `log-badge--${value}`]">{{ value }}</span>
        </template>
        <template #timestamp="{ value }">{{ formatDate(value) }}</template>
      </AppDataTable>
      <p class="pagination-info" v-if="logsTotal > 0">{{ logs.length }} of {{ logsTotal }} entries</p>
    </template>

    <!-- Alerts tab -->
    <template v-else-if="activeTab === 'Alerts'">
      <div class="section-header">
        <label class="check-label">
          <input type="checkbox" v-model="unacknowledgedOnly" @change="loadAlerts" data-testid="unack-only-toggle" />
          Unacknowledged only
        </label>
        <button class="btn-icon" @click="loadAlerts" aria-label="Refresh">↻</button>
        <button
          v-if="canManageThresholds"
          class="btn btn--primary btn--sm"
          @click="showThresholdPanel = true"
          data-testid="add-threshold-btn"
        >+ Threshold</button>
      </div>

      <LoadingSpinner v-if="alertsLoading" label="Loading alerts…" />
      <ErrorState v-else-if="alertsError" :message="alertsError.message" :on-retry="loadAlerts" />
      <div v-else class="alert-list" data-testid="alert-list">
        <EmptyState v-if="alerts.length === 0" label="No alert events" />
        <div
          v-for="alert in alerts"
          :key="alert.id"
          class="alert-card"
          :class="{ 'alert-card--acked': alert.acknowledgedAt }"
          :data-testid="`alert-${alert.id}`"
        >
          <div class="alert-header">
            <span class="alert-metric">{{ alert.metricName }}</span>
            <span class="alert-op">{{ alert.operator }}</span>
            <span class="alert-threshold">{{ alert.thresholdValue }}</span>
            <span class="alert-actual">(actual: {{ alert.metricValue }})</span>
          </div>
          <div class="alert-meta">
            Triggered {{ formatDate(alert.triggeredAt) }}
            <template v-if="alert.acknowledgedAt"> · Acked {{ formatDate(alert.acknowledgedAt) }} by {{ alert.acknowledgedBy }}</template>
          </div>
          <button
            v-if="!alert.acknowledgedAt && canWrite"
            class="btn btn--sm"
            @click="ackAlert(alert.id)"
            :data-testid="`ack-alert-${alert.id}`"
          >Acknowledge</button>
        </div>
      </div>

      <!-- Add Threshold Panel -->
      <SidePanel v-model="showThresholdPanel" title="Add Alert Threshold">
        <div class="field">
          <label class="field-label">Metric</label>
          <select v-model="newThreshold.metricName" class="input" data-testid="threshold-metric">
            <option value="p95_latency">P95 Latency (ms)</option>
            <option value="cpu_utilization">CPU Utilization (%)</option>
            <option value="gpu_utilization">GPU Utilization (%)</option>
            <option value="error_rate">Error Rate (%)</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">Operator</label>
          <select v-model="newThreshold.operator" class="input" data-testid="threshold-operator">
            <option value="gt">&gt;</option>
            <option value="gte">&ge;</option>
            <option value="lt">&lt;</option>
            <option value="lte">&le;</option>
            <option value="eq">=</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">Threshold Value</label>
          <input
            type="number"
            v-model.number="newThreshold.thresholdValue"
            class="input"
            data-testid="threshold-value"
          />
        </div>
        <p v-if="thresholdError" class="form-error" data-testid="threshold-error">{{ thresholdError }}</p>
        <template #footer>
          <button class="btn btn--primary" :disabled="thresholdSubmitting" @click="saveThreshold" data-testid="save-threshold-btn">
            {{ thresholdSubmitting ? 'Saving…' : 'Save' }}
          </button>
          <button class="btn" @click="showThresholdPanel = false">Cancel</button>
        </template>
      </SidePanel>
    </template>

    <!-- Notifications tab -->
    <template v-else-if="activeTab === 'Notifications'">
      <div class="section-header">
        <label class="check-label">
          <input type="checkbox" v-model="unreadOnly" @change="loadNotifications" data-testid="unread-only-toggle" />
          Unread only
        </label>
        <button class="btn-icon" @click="loadNotifications" aria-label="Refresh">↻</button>
      </div>
      <LoadingSpinner v-if="notificationsLoading" label="Loading notifications…" />
      <div v-else class="notif-list" data-testid="notifications-list">
        <EmptyState v-if="notifications.length === 0" label="No notifications" />
        <div
          v-for="notif in notifications"
          :key="notif.id"
          class="notif-card"
          :class="{ 'notif-card--read': notif.readAt }"
          :data-testid="`notif-${notif.id}`"
        >
          <span class="notif-type">{{ notif.type }}</span>
          <span class="notif-message">{{ notif.message }}</span>
          <span class="notif-time">{{ formatDate(notif.createdAt) }}</span>
          <button
            v-if="!notif.readAt"
            class="btn btn--sm"
            @click="markRead(notif.id)"
            :data-testid="`mark-read-${notif.id}`"
          >Mark read</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import KpiCard from '../../components/shared/KpiCard.vue';
import AppDataTable from '../../components/shared/AppDataTable.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import SidePanel from '../../components/shared/SidePanel.vue';
import {
  observabilityService,
  type MetricsSummary,
  type ApplicationLogEntry,
  type AlertEvent,
  type NotificationEvent,
} from '../../services/observability.service.js';
import { useAuthStore } from '../../stores/auth.store.js';

const auth = useAuthStore();
const canWrite = computed(() => auth.hasPermission('write:observability:*'));
const canManageThresholds = computed(() =>
  auth.hasAnyRole('Administrator', 'OpsManager'),
);

const TABS = ['Metrics', 'Logs', 'Alerts', 'Notifications'] as const;
type Tab = (typeof TABS)[number];
const activeTab = ref<Tab>('Metrics');

// ---- Metrics ----
const metrics = ref<MetricsSummary | null>(null);
const metricsLoading = ref(false);
const metricsError = ref<Error | null>(null);

async function loadMetrics() {
  metricsLoading.value = true;
  metricsError.value = null;
  try {
    metrics.value = await observabilityService.getMetricsSummary();
  } catch (e: any) {
    metricsError.value = e;
  } finally {
    metricsLoading.value = false;
  }
}

// ---- Logs ----
const logs = ref<ApplicationLogEntry[]>([]);
const logsTotal = ref(0);
const logsLoading = ref(false);
const logsError = ref<Error | null>(null);
const logLevel = ref('');
const logSearch = ref('');

const logColumns = [
  { field: 'level', header: 'Level', width: '80px' },
  { field: 'message', header: 'Message' },
  { field: 'timestamp', header: 'Time', width: '180px' },
];

async function loadLogs() {
  logsLoading.value = true;
  logsError.value = null;
  try {
    const result = await observabilityService.searchLogs({
      level: logLevel.value || undefined,
      search: logSearch.value || undefined,
    });
    logs.value = result.logs;
    logsTotal.value = result.total;
  } catch (e: any) {
    logsError.value = e;
  } finally {
    logsLoading.value = false;
  }
}

// ---- Alerts ----
const alerts = ref<AlertEvent[]>([]);
const alertsLoading = ref(false);
const alertsError = ref<Error | null>(null);
const unacknowledgedOnly = ref(false);

async function loadAlerts() {
  alertsLoading.value = true;
  alertsError.value = null;
  try {
    alerts.value = await observabilityService.listAlertEvents(unacknowledgedOnly.value);
  } catch (e: any) {
    alertsError.value = e;
  } finally {
    alertsLoading.value = false;
  }
}

async function ackAlert(id: string) {
  await observabilityService.acknowledgeAlert(id);
  await loadAlerts();
}

// Threshold panel
const showThresholdPanel = ref(false);
const thresholdSubmitting = ref(false);
const thresholdError = ref('');
const newThreshold = ref({ metricName: 'cpu_utilization', operator: 'gt', thresholdValue: 90 });

async function saveThreshold() {
  if (!newThreshold.value.metricName || !newThreshold.value.operator) {
    thresholdError.value = 'All fields are required.';
    return;
  }
  thresholdSubmitting.value = true;
  thresholdError.value = '';
  try {
    await observabilityService.createThreshold(newThreshold.value);
    showThresholdPanel.value = false;
    newThreshold.value = { metricName: 'cpu_utilization', operator: 'gt', thresholdValue: 90 };
  } catch (e: any) {
    thresholdError.value = e?.message ?? 'Failed to save threshold.';
  } finally {
    thresholdSubmitting.value = false;
  }
}

// ---- Notifications ----
const notifications = ref<NotificationEvent[]>([]);
const notificationsLoading = ref(false);
const unreadOnly = ref(false);
const lastAudibleUnreadCount = ref(0);

function playAudibleCue() {
  if (typeof window === 'undefined') return;
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) return;

  try {
    const audioContext = new AudioContextCtor();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.22);
    oscillator.onended = () => { void audioContext.close(); };
  } catch {
    // Ignore audio playback failures (e.g., browser autoplay policy).
  }
}

async function loadNotifications() {
  notificationsLoading.value = true;
  try {
    notifications.value = await observabilityService.listNotifications(unreadOnly.value);
    const audibleUnreadCount = notifications.value.filter(
      (n) => n.type === 'audible' && !n.readAt,
    ).length;
    if (audibleUnreadCount > lastAudibleUnreadCount.value) {
      playAudibleCue();
    }
    lastAudibleUnreadCount.value = audibleUnreadCount;
  } finally {
    notificationsLoading.value = false;
  }
}

async function markRead(id: string) {
  await observabilityService.markNotificationRead(id);
  await loadNotifications();
}

// ---- Helpers ----
function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

onMounted(loadMetrics);
</script>

<style scoped>
.view-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
.view-title { font-size: 1.4rem; font-weight: 700; color: #111827; margin: 0; }
.tab-bar { display: flex; background: #f3f4f6; border-radius: 6px; padding: 3px; gap: 2px; }
.tab-btn { border: none; background: transparent; padding: 0.3rem 0.9rem; border-radius: 4px; font-size: 0.85rem; font-weight: 500; cursor: pointer; color: #6b7280; }
.tab-btn--active { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 0.75rem; }
.metric-timestamp { font-size: 0.8rem; color: #9ca3af; }
.filter-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.filter-select { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.4rem 0.6rem; font-size: 0.875rem; }
.search-input { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.4rem 0.7rem; font-size: 0.875rem; width: 220px; }
.btn-icon { background: transparent; border: 1px solid #d1d5db; border-radius: 4px; padding: 0.4rem 0.7rem; cursor: pointer; }
.section-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.check-label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.875rem; color: #374151; cursor: pointer; }
.log-badge { padding: 0.15rem 0.45rem; border-radius: 10px; font-size: 0.73rem; font-weight: 600; }
.log-badge--debug { background: #f3f4f6; color: #6b7280; }
.log-badge--info { background: #dbeafe; color: #1e40af; }
.log-badge--warn { background: #fef3c7; color: #92400e; }
.log-badge--error { background: #fee2e2; color: #991b1b; }
.pagination-info { font-size: 0.8rem; color: #9ca3af; margin-top: 0.5rem; }
.alert-list { display: flex; flex-direction: column; gap: 0.75rem; }
.alert-card { background: #fff; border-radius: 8px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-left: 3px solid #ef4444; display: flex; flex-direction: column; gap: 0.4rem; }
.alert-card--acked { border-left-color: #d1d5db; opacity: 0.7; }
.alert-header { display: flex; gap: 0.4rem; align-items: baseline; font-weight: 600; }
.alert-metric { color: #111827; }
.alert-op, .alert-threshold { color: #6b7280; font-size: 0.875rem; }
.alert-actual { color: #ef4444; font-size: 0.875rem; }
.alert-meta { font-size: 0.8rem; color: #6b7280; }
.field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.75rem; }
.field-label { font-size: 0.875rem; font-weight: 500; color: #374151; }
.input { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.45rem 0.65rem; font-size: 0.875rem; }
.btn { padding: 0.4rem 0.9rem; border-radius: 4px; border: 1px solid #d1d5db; font-size: 0.875rem; cursor: pointer; font-weight: 500; }
.btn--primary { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }
.btn--sm { padding: 0.25rem 0.6rem; font-size: 0.8rem; width: fit-content; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.form-error { color: #ef4444; font-size: 0.8rem; }
.notif-list { display: flex; flex-direction: column; gap: 0.5rem; }
.notif-card { background: #fff; border-radius: 6px; padding: 0.75rem 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.07); display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.notif-card--read { opacity: 0.55; }
.notif-type { font-size: 0.75rem; font-weight: 600; padding: 0.15rem 0.45rem; border-radius: 10px; background: #dbeafe; color: #1e40af; }
.notif-message { flex: 1; font-size: 0.875rem; color: #111827; }
.notif-time { font-size: 0.75rem; color: #9ca3af; }
</style>
