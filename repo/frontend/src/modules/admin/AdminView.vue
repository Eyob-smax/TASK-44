<template>
  <div class="view" data-testid="admin-view">
    <div class="view-header">
      <h2 class="view-title">Admin / Master Data</h2>
      <div class="tab-bar" role="tablist">
        <button
          v-for="tab in TABS"
          :key="tab"
          :class="['tab-btn', { 'tab-btn--active': activeTab === tab }]"
          role="tab"
          @click="activeTab = tab"
          :data-testid="`tab-${tab}`"
        >{{ tab }}</button>
      </div>
    </div>

    <!-- Students tab -->
    <template v-if="activeTab === 'Students'">
      <div class="section-header">
        <input v-model="studentSearch" class="search-input" placeholder="Search students…" data-testid="student-search" @input="fetchStudents" />
        <button class="btn-icon" @click="fetchStudents" aria-label="Refresh">↻</button>
      </div>
      <LoadingSpinner v-if="studentsLoading" label="Loading students…" />
      <ErrorState v-else-if="studentsError" :message="studentsError.message" :on-retry="fetchStudents" />
      <AppDataTable
        v-else
        :columns="studentColumns"
        :rows="students as any"
        row-key="id"
        :searchable="false"
        empty-label="No students found"
        data-testid="students-table"
      />
    </template>

    <!-- Import tab -->
    <template v-else-if="activeTab === 'Import'">
      <div class="io-card" data-testid="import-section">
        <h3 class="section-title">Import Data</h3>
        <div class="field">
          <label class="field-label" for="imp-entity">Entity Type</label>
          <select id="imp-entity" v-model="importEntityType" class="input" data-testid="import-entity-select">
            <option value="students">Students</option>
            <option value="classes">Classes</option>
            <option value="departments">Departments</option>
            <option value="courses">Courses</option>
            <option value="semesters">Semesters</option>
          </select>
        </div>
        <button
          class="btn btn--primary"
          :disabled="importSubmitting || isAuditor"
          @click="triggerImport"
          data-testid="import-trigger"
        >{{ importSubmitting ? 'Queuing…' : 'Start Import' }}</button>
        <div v-if="isAuditor" class="readonly-notice">Read-only: Auditors cannot trigger imports.</div>

        <!-- Job status -->
        <template v-if="importJob">
          <div class="job-status" data-testid="import-job-status">
            <span class="job-label">Status:</span>
            <span :class="['job-badge', `job-badge--${importJob.status}`]">{{ importJob.status }}</span>
            <template v-if="importJob.successRows !== null">
              <span class="job-stat">{{ importJob.successRows }} succeeded</span>
            </template>
          </div>
          <div v-if="importJob.failedRows && importJob.failedRows > 0" class="error-report-row" data-testid="error-report-row">
            <span class="job-error">{{ importJob.failedRows }} row(s) failed</span>
            <a
              v-if="importJob.errorReportAssetId"
              :href="`/api/files/${importJob.errorReportAssetId}`"
              class="download-link"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="download-error-report"
            >
              Download Error Report CSV
            </a>
          </div>
        </template>
      </div>
    </template>

    <!-- Export tab -->
    <template v-else-if="activeTab === 'Export'">
      <div class="io-card" data-testid="export-section">
        <h3 class="section-title">Export Data</h3>
        <div class="field">
          <label class="field-label" for="exp-entity">Entity Type</label>
          <select id="exp-entity" v-model="exportEntityType" class="input" data-testid="export-entity-select">
            <option value="students">Students</option>
            <option value="classes">Classes</option>
          </select>
        </div>
        <button
          class="btn btn--primary"
          :disabled="exportSubmitting"
          @click="triggerExport"
          data-testid="export-trigger"
        >{{ exportSubmitting ? 'Queuing…' : 'Start Export' }}</button>

        <template v-if="exportJob">
          <div class="job-status" data-testid="export-job-status">
            <span class="job-label">Status:</span>
            <span :class="['job-badge', `job-badge--${exportJob.status}`]">{{ exportJob.status }}</span>
          </div>
          <div v-if="exportJob.status === 'completed' && exportJob.fileAssetId" class="download-row" data-testid="export-download-row">
            <a
              :href="`/api/files/${exportJob.fileAssetId}`"
              :download="exportFilename"
              class="download-link"
              data-testid="download-export"
            >
              Download {{ exportFilename }}
            </a>
          </div>
        </template>
      </div>
    </template>

    <!-- Config tab -->
    <template v-else-if="activeTab === 'Config'">
      <div class="io-card" data-testid="config-section">
        <h3 class="section-title">Runtime Configuration</h3>
        <LoadingSpinner v-if="configLoading" label="Loading config…" />
        <ErrorState v-else-if="configError" :message="configError.message" :on-retry="loadConfig" />
        <template v-else-if="configData">
          <div class="field">
            <label class="field-label">Heartbeat Freshness (seconds)</label>
            <input
              type="number"
              v-model.number="configForm.heartbeatFreshnessSeconds"
              class="input"
              :disabled="!isAdmin"
              data-testid="config-heartbeat"
            />
          </div>
          <div class="field">
            <label class="field-label">Parking Escalation (minutes)</label>
            <input
              type="number"
              v-model.number="configForm.parkingEscalationMinutes"
              class="input"
              :disabled="!isAdmin"
              data-testid="config-escalation"
            />
          </div>
          <div class="field">
            <label class="field-label">Log Retention (days)</label>
            <input
              type="number"
              v-model.number="configForm.logRetentionDays"
              class="input"
              :disabled="!isAdmin"
              data-testid="config-log-retention"
            />
          </div>
          <div class="field">
            <label class="check-label">
              <input type="checkbox" v-model="configForm.storedValueEnabled" :disabled="!isAdmin" data-testid="config-stored-value" />
              Stored Value Wallets Enabled
            </label>
          </div>
          <div class="info-row">
            <span class="info-key">Storage path:</span>
            <code class="info-val">{{ configData.config.storagePath }}</code>
          </div>
          <div class="info-row">
            <span class="info-key">Backup path:</span>
            <code class="info-val">{{ configData.config.backupPath }}</code>
          </div>
          <div class="info-row">
            <span class="info-key">Last updated:</span>
            <span class="info-val">{{ new Date(configData.updatedAt).toLocaleString() }}</span>
          </div>
          <div v-if="!isAdmin" class="readonly-notice">Read-only: only Administrators can change runtime config.</div>
          <button
            v-if="isAdmin"
            class="btn btn--primary"
            :disabled="configSubmitting"
            @click="saveConfig"
            data-testid="save-config-btn"
          >{{ configSubmitting ? 'Saving…' : 'Save Changes' }}</button>
          <p v-if="configSaveError" class="form-error">{{ configSaveError }}</p>
        </template>
      </div>
    </template>

    <!-- Backups tab -->
    <template v-else-if="activeTab === 'Backups'">
      <div class="section-header">
        <button class="btn-icon" @click="loadBackups" aria-label="Refresh">↻</button>
        <button
          v-if="isAdmin"
          class="btn btn--primary btn--sm"
          :disabled="backupTriggering"
          @click="triggerBackup"
          data-testid="trigger-backup-btn"
        >{{ backupTriggering ? 'Starting…' : 'Trigger Backup' }}</button>
      </div>
      <LoadingSpinner v-if="backupsLoading" label="Loading backups…" />
      <ErrorState v-else-if="backupsError" :message="backupsError.message" :on-retry="loadBackups" />
      <AppDataTable
        v-else
        :columns="backupColumns"
        :rows="backups as any"
        row-key="id"
        :searchable="false"
        empty-label="No backups found"
        data-testid="backups-table"
      >
        <template #status="{ value }">
          <span :class="['job-badge', `job-badge--${value}`]">{{ value }}</span>
        </template>
        <template #startedAt="{ value }">{{ new Date(value).toLocaleString() }}</template>
        <template #expiresAt="{ value }">{{ new Date(value).toLocaleString() }}</template>
        <template #actions="{ row }">
          <button
            v-if="isAdmin && row.status === 'completed'"
            class="btn btn--sm"
            @click="triggerRestore(row.id)"
            :data-testid="`restore-${row.id}`"
          >Restore</button>
        </template>
      </AppDataTable>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppDataTable from '../../components/shared/AppDataTable.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import {
  masterDataService,
  type StudentResponse,
  type ImportJobResponse,
  type ExportJobResponse,
} from '../../services/master-data.service.js';
import { get, post, patch } from '../../services/api-client.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';

const auth = useAuthStore();
const ui = useUiStore();
const isAuditor = computed(() => auth.hasAnyRole('Auditor') && !auth.hasAnyRole('Administrator', 'OpsManager'));
const isAdmin = computed(() => auth.hasAnyRole('Administrator'));

function getOrgId(): string {
  const orgId = auth.user?.orgId;
  if (!orgId) throw new Error('Organization context is required');
  return orgId;
}
const TABS = ['Students', 'Import', 'Export', 'Config', 'Backups'] as const;
type Tab = (typeof TABS)[number];
const activeTab = ref<Tab>('Students');

// ---- Students ----
const students = ref<StudentResponse[]>([]);
const studentsLoading = ref(false);
const studentsError = ref<Error | null>(null);
const studentSearch = ref('');

const studentColumns = [
  { field: 'studentNumber', header: 'Student #', width: '120px' },
  { field: 'firstName', header: 'First Name' },
  { field: 'lastName', header: 'Last Name' },
  { field: 'email', header: 'Email' },
];

async function fetchStudents() {
  studentsLoading.value = true;
  studentsError.value = null;
  try {
    const res = await masterDataService.listStudents(getOrgId(), { search: studentSearch.value || undefined });
    students.value = res.students;
  } catch (e: any) {
    studentsError.value = e;
  } finally {
    studentsLoading.value = false;
  }
}

// ---- Import ----
const importEntityType = ref('students');
const importSubmitting = ref(false);
const importJob = ref<ImportJobResponse | null>(null);
let importPollTimer: ReturnType<typeof setInterval> | null = null;

async function triggerImport() {
  if (importSubmitting.value || isAuditor.value) return;
  importSubmitting.value = true;
  importJob.value = null;
  try {
    const { importJobId } = await masterDataService.triggerImport(getOrgId(), importEntityType.value);
    ui.notifySuccess('Import queued', `Job: ${importJobId}`);
    pollImport(importJobId);
  } catch (e: any) {
    ui.notifyError('Import failed', e?.message);
  } finally {
    importSubmitting.value = false;
  }
}

function pollImport(jobId: string) {
  if (importPollTimer) clearInterval(importPollTimer);
  importPollTimer = setInterval(async () => {
    try {
      const job = await masterDataService.getImportJob(getOrgId(), jobId);
      importJob.value = job;
      if (job.status === 'completed' || job.status === 'partial_success' || job.status === 'failed') {
        clearInterval(importPollTimer!);
        importPollTimer = null;
        if (job.failedRows && job.failedRows > 0) {
          ui.notifyWarn(`Import finished: ${job.failedRows} row(s) had errors`);
        } else {
          ui.notifySuccess('Import complete');
        }
      }
    } catch {
      clearInterval(importPollTimer!);
      importPollTimer = null;
    }
  }, 3000);
}

// ---- Export ----
const exportEntityType = ref('students');
const exportSubmitting = ref(false);
const exportJob = ref<ExportJobResponse | null>(null);
let exportPollTimer: ReturnType<typeof setInterval> | null = null;

const exportFilename = computed(() => {
  const date = new Date().toISOString().slice(0, 10);
  return `export_${exportEntityType.value}_${date}.csv`;
});

async function triggerExport() {
  if (exportSubmitting.value) return;
  exportSubmitting.value = true;
  exportJob.value = null;
  try {
    const { exportJobId } = await masterDataService.triggerExport(getOrgId(), exportEntityType.value);
    ui.notifySuccess('Export queued', `Job: ${exportJobId}`);
    pollExport(exportJobId);
  } catch (e: any) {
    ui.notifyError('Export failed', e?.message);
  } finally {
    exportSubmitting.value = false;
  }
}

function pollExport(jobId: string) {
  if (exportPollTimer) clearInterval(exportPollTimer);
  exportPollTimer = setInterval(async () => {
    try {
      const job = await masterDataService.getExportJob(getOrgId(), jobId);
      exportJob.value = job;
      if (job.status === 'completed' || job.status === 'failed') {
        clearInterval(exportPollTimer!);
        exportPollTimer = null;
        if (job.status === 'completed') {
          ui.notifySuccess('Export ready for download');
        }
      }
    } catch {
      clearInterval(exportPollTimer!);
      exportPollTimer = null;
    }
  }, 3000);
}

// ---- Config ----
interface ConfigResponse {
  config: {
    heartbeatFreshnessSeconds: number;
    storedValueEnabled: boolean;
    logRetentionDays: number;
    parkingEscalationMinutes: number;
    storagePath: string;
    backupPath: string;
  };
  updatedAt: string;
}

const configData = ref<ConfigResponse | null>(null);
const configLoading = ref(false);
const configError = ref<Error | null>(null);
const configSubmitting = ref(false);
const configSaveError = ref('');
const configForm = ref({
  heartbeatFreshnessSeconds: 120,
  parkingEscalationMinutes: 15,
  logRetentionDays: 30,
  storedValueEnabled: false,
});

async function loadConfig() {
  configLoading.value = true;
  configError.value = null;
  try {
    configData.value = await get<ConfigResponse>('/config');
    const c = configData.value.config;
    configForm.value = {
      heartbeatFreshnessSeconds: c.heartbeatFreshnessSeconds,
      parkingEscalationMinutes: c.parkingEscalationMinutes,
      logRetentionDays: c.logRetentionDays,
      storedValueEnabled: c.storedValueEnabled,
    };
  } catch (e: any) {
    configError.value = e;
  } finally {
    configLoading.value = false;
  }
}

async function saveConfig() {
  configSubmitting.value = true;
  configSaveError.value = '';
  try {
    configData.value = await patch<ConfigResponse>('/config', configForm.value);
    ui.notifySuccess('Configuration saved');
  } catch (e: any) {
    configSaveError.value = e?.message ?? 'Failed to save configuration.';
  } finally {
    configSubmitting.value = false;
  }
}

// ---- Backups ----
interface BackupRecord {
  id: string;
  type: string;
  status: string;
  sizeBytes: string | null;
  startedAt: string;
  completedAt: string | null;
  expiresAt: string;
}

const backups = ref<BackupRecord[]>([]);
const backupsLoading = ref(false);
const backupsError = ref<Error | null>(null);
const backupTriggering = ref(false);

const backupColumns = [
  { field: 'type', header: 'Type', width: '80px' },
  { field: 'status', header: 'Status', width: '100px' },
  { field: 'sizeBytes', header: 'Size', width: '100px' },
  { field: 'startedAt', header: 'Started', width: '180px' },
  { field: 'expiresAt', header: 'Expires', width: '180px' },
  { field: 'actions', header: '', width: '100px' },
];

async function loadBackups() {
  backupsLoading.value = true;
  backupsError.value = null;
  try {
    const data = await get<{ backups: BackupRecord[] }>('/backups');
    backups.value = data.backups;
  } catch (e: any) {
    backupsError.value = e;
  } finally {
    backupsLoading.value = false;
  }
}

async function triggerBackup() {
  backupTriggering.value = true;
  try {
    await post('/backups', { type: 'full' });
    ui.notifySuccess('Backup job queued');
    await loadBackups();
  } catch (e: any) {
    ui.notifyError('Backup failed', e?.message);
  } finally {
    backupTriggering.value = false;
  }
}

async function triggerRestore(backupId: string) {
  try {
    await post(`/backups/${backupId}/restore`);
    ui.notifySuccess('Restore job queued');
  } catch (e: any) {
    ui.notifyError('Restore failed', e?.message);
  }
}

onMounted(fetchStudents);
</script>

<style scoped>
.view-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
.view-title { font-size: 1.4rem; font-weight: 700; color: #111827; margin: 0; }
.tab-bar { display: flex; background: #f3f4f6; border-radius: 6px; padding: 3px; gap: 2px; }
.tab-btn { border: none; background: transparent; padding: 0.3rem 0.9rem; border-radius: 4px; font-size: 0.85rem; font-weight: 500; cursor: pointer; color: #6b7280; }
.tab-btn--active { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.section-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.search-input { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.4rem 0.7rem; font-size: 0.875rem; width: 260px; }
.btn-icon { background: transparent; border: 1px solid #d1d5db; border-radius: 4px; padding: 0.4rem 0.7rem; cursor: pointer; }
.io-card { background: #fff; border-radius: 8px; padding: 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,0.08); display: flex; flex-direction: column; gap: 1rem; max-width: 520px; }
.section-title { font-size: 1rem; font-weight: 700; color: #111827; margin: 0; }
.field { display: flex; flex-direction: column; gap: 0.3rem; }
.field-label { font-size: 0.875rem; font-weight: 500; color: #374151; }
.check-label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.875rem; color: #374151; cursor: pointer; }
.input { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.45rem 0.65rem; font-size: 0.875rem; }
.input:disabled { background: #f9fafb; color: #9ca3af; }
.btn { padding: 0.5rem 1rem; border-radius: 4px; border: 1px solid #d1d5db; font-size: 0.875rem; cursor: pointer; font-weight: 500; width: fit-content; }
.btn--primary { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }
.btn--sm { padding: 0.25rem 0.65rem; font-size: 0.8rem; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.readonly-notice { font-size: 0.8rem; color: #9ca3af; font-style: italic; }
.info-row { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.875rem; }
.info-key { color: #6b7280; font-weight: 500; min-width: 120px; }
.info-val { color: #111827; }
.form-error { color: #ef4444; font-size: 0.8rem; }
.job-status { display: flex; align-items: center; gap: 0.6rem; font-size: 0.875rem; }
.job-label { color: #6b7280; font-weight: 500; }
.job-badge { padding: 0.2rem 0.55rem; border-radius: 10px; font-size: 0.75rem; font-weight: 600; }
.job-badge--pending { background: #f3f4f6; color: #374151; }
.job-badge--running, .job-badge--processing { background: #dbeafe; color: #1e40af; }
.job-badge--completed { background: #dcfce7; color: #166534; }
.job-badge--partial_success { background: #fef3c7; color: #92400e; }
.job-badge--failed { background: #fee2e2; color: #991b1b; }
.job-stat { color: #374151; font-size: 0.8rem; }
.job-error { color: #ef4444; font-weight: 600; font-size: 0.85rem; }
.error-report-row { display: flex; align-items: center; gap: 0.75rem; }
.download-link { color: #6495ed; text-decoration: none; font-weight: 600; font-size: 0.875rem; }
.download-link:hover { text-decoration: underline; }
.download-row { display: flex; }
</style>
