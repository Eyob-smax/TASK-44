<template>
  <div class="view" data-testid="after-sales-view">
    <div class="view-header">
      <h2 class="view-title">After-Sales</h2>
      <div class="header-actions">
        <select v-model="filters.status" class="filter-select" aria-label="Filter by status" data-testid="status-filter">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select v-model="filters.priority" class="filter-select" aria-label="Filter by priority" data-testid="priority-filter">
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button v-if="canWrite" class="btn btn--primary" @click="openCreate" data-testid="btn-create-ticket">
          + New Ticket
        </button>
        <button class="btn-icon" @click="reload" aria-label="Refresh">↻</button>
      </div>
    </div>

    <LoadingSpinner v-if="isLoading && tickets.length === 0" label="Loading tickets…" />
    <ErrorState v-else-if="listError" :message="listError.message" :on-retry="reload" />

    <AppDataTable
      v-else
      :columns="ticketColumns"
      :rows="tickets as any"
      row-key="id"
      :searchable="true"
      search-placeholder="Search tickets…"
      empty-label="No tickets found"
    >
      <template #type="{ value }">
        <span :class="['badge', `badge--type-${value}`]">{{ value.replace(/_/g,' ') }}</span>
      </template>
      <template #priority="{ value }">
        <span :class="['badge', `badge--pri-${value}`]">{{ value }}</span>
      </template>
      <template #status="{ value }">
        <span :class="['badge', `badge--status-${value}`]">{{ value.replace(/_/g,' ') }}</span>
      </template>
      <template #slaDeadlineAt="{ value, row }">
        <span :class="{ 'sla-overdue': isSlaOverdue(value), 'sla-near': isSlaClose(value) }">
          {{ value ? formatDate(value) : '—' }}
        </span>
      </template>
      <template #actions="{ row }">
        <button class="btn-sm" @click="openDetail(row)" data-testid="btn-ticket-detail">View</button>
      </template>
    </AppDataTable>

    <!-- Create Ticket Panel -->
    <SidePanel v-model="createOpen" title="New Ticket">
      <div class="form" data-testid="create-ticket-form">
        <div class="field">
          <label class="field-label" for="tk-type">Type <span class="required">*</span></label>
          <select id="tk-type" v-model="createForm.type" class="input" data-testid="ticket-type-select">
            <option value="">Select type…</option>
            <option value="delay">Delay</option>
            <option value="dispute">Dispute</option>
            <option value="lost_item">Lost Item</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="tk-priority">Priority</label>
          <select id="tk-priority" v-model="createForm.priority" class="input">
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="tk-shipment">Shipment ID</label>
          <input id="tk-shipment" v-model="createForm.shipmentId" class="input" placeholder="Optional" />
        </div>
        <div class="field">
          <label class="field-label" for="tk-desc">Description <span class="required">*</span></label>
          <textarea id="tk-desc" v-model="createForm.description" class="textarea" rows="4" data-testid="ticket-description" />
        </div>
        <p v-if="createError" class="field-error" role="alert" data-testid="create-error">{{ createError }}</p>
      </div>
      <template #footer>
        <button class="btn btn--secondary" @click="createOpen = false">Cancel</button>
        <button
          class="btn btn--primary"
          :disabled="createSubmitting"
          @click="submitCreate"
          data-testid="submit-create-ticket"
        >{{ createSubmitting ? 'Creating…' : 'Create Ticket' }}</button>
      </template>
    </SidePanel>

    <!-- Ticket Detail Panel -->
    <SidePanel v-model="detailOpen" title="Ticket Detail">
      <LoadingSpinner v-if="detailLoading" label="Loading ticket…" />
      <div v-else-if="detail" class="detail-body" data-testid="ticket-detail">
        <!-- Header info -->
        <div class="detail-meta">
          <span :class="['badge', `badge--type-${detail.type}`]">{{ detail.type.replace(/_/g,' ') }}</span>
          <span :class="['badge', `badge--pri-${detail.priority}`]">{{ detail.priority }}</span>
          <span :class="['badge', `badge--status-${detail.status}`]">{{ detail.status.replace(/_/g,' ') }}</span>
        </div>
        <div v-if="detail.slaDeadlineAt" class="sla-row">
          <span class="detail-label">SLA Deadline</span>
          <span :class="{ 'sla-overdue': isSlaOverdue(detail.slaDeadlineAt), 'sla-near': isSlaClose(detail.slaDeadlineAt) }">
            {{ formatDate(detail.slaDeadlineAt) }}
          </span>
        </div>
        <div class="detail-row" v-if="detail.assignedTo">
          <span class="detail-label">Assigned To</span>
          <span>{{ detail.assignedTo }}</span>
        </div>

        <!-- Actions (role-gated) -->
        <div class="action-group" v-if="canWrite">
          <button
            v-if="!detail.assignedTo"
            class="btn btn--secondary"
            @click="openAssignTicket"
            data-testid="btn-assign-ticket"
          >Assign</button>
          <button
            v-if="canApprove && detail.status !== 'pending_approval'"
            class="btn btn--secondary"
            :disabled="suggestSubmitting"
            @click="suggestCompensation"
            data-testid="btn-suggest-comp"
          >Suggest Compensation</button>
        </div>

        <!-- Compensation section -->
        <template v-if="detail.compensations.length > 0">
          <h4 class="section-title">Compensation</h4>
          <div
            v-for="comp in detail.compensations"
            :key="comp.id"
            class="comp-item"
            data-testid="compensation-item"
          >
            <div class="comp-header">
              <span class="comp-amount">${{ comp.suggestedAmount.toFixed(2) }}</span>
              <span :class="['badge', `badge--comp-${comp.status}`]">{{ comp.status }}</span>
            </div>
            <p class="comp-reason">{{ comp.reason }}</p>
            <div v-if="comp.status === 'pending' && canApprove" class="comp-actions">
              <button class="btn btn--primary" @click="approveComp(comp.id, 'approved')" data-testid="btn-approve-comp">Approve</button>
              <button class="btn btn--secondary" @click="openRejectComp(comp.id)" data-testid="btn-reject-comp">Reject</button>
            </div>
            <div v-if="comp.approval" class="comp-approval">
              <span :class="comp.approval.decision === 'approved' ? 'text-success' : 'text-error'">
                {{ comp.approval.decision === 'approved' ? '✓ Approved' : '✗ Rejected' }}
              </span>
              <span v-if="comp.approval.notes" class="comp-notes">{{ comp.approval.notes }}</span>
            </div>
          </div>
        </template>

        <!-- Evidence -->
        <h4 class="section-title">Evidence ({{ detail.evidence.length }})</h4>
        <div v-for="ev in detail.evidence" :key="ev.id" class="evidence-item" data-testid="evidence-item">
          <span class="evidence-icon">📎</span>
          <div>
            <div class="evidence-desc">{{ ev.description ?? ev.fileAssetId }}</div>
            <div class="evidence-meta">Uploaded by {{ ev.uploadedBy }} · {{ formatDate(ev.uploadedAt) }}</div>
          </div>
        </div>
        <EmptyState v-if="detail.evidence.length === 0" label="No evidence attached" />

        <template v-if="canWrite">
          <h4 class="section-title">Attach Evidence</h4>
          <div class="evidence-upload">
            <input
              type="file"
              accept="image/png,image/jpeg"
              class="input"
              data-testid="evidence-file-input"
              @change="onEvidenceFileSelected"
            />
            <input
              v-model="evidenceDescription"
              class="input"
              placeholder="Optional description"
              data-testid="evidence-description-input"
            />
            <button
              class="btn btn--secondary"
              :disabled="evidenceSubmitting || !evidenceFile"
              @click="addEvidenceFile"
              data-testid="btn-add-evidence"
            >{{ evidenceSubmitting ? 'Uploading…' : 'Upload Evidence' }}</button>
          </div>
        </template>

        <!-- Add note (write only) -->
        <template v-if="canWrite">
          <h4 class="section-title">Add Note</h4>
          <div class="note-form">
            <textarea v-model="noteContent" class="textarea" rows="2" placeholder="Add a note to the timeline…" data-testid="note-input" />
            <button class="btn btn--secondary" :disabled="noteSubmitting || !noteContent.trim()" @click="addNote" data-testid="btn-add-note">
              {{ noteSubmitting ? 'Adding…' : 'Add Note' }}
            </button>
          </div>
        </template>

        <!-- Timeline -->
        <h4 class="section-title">Timeline</h4>
        <AppTimeline
          :entries="detail.timeline.map((t) => ({ id: t.id, type: t.entryType, content: t.content, userId: t.userId, createdAt: t.createdAt }))"
        />
      </div>
    </SidePanel>

    <!-- Assign Ticket Panel -->
    <SidePanel v-model="assignTicketOpen" title="Assign Ticket">
      <div class="form">
        <label class="field-label" for="assign-user">User ID <span class="required">*</span></label>
        <input id="assign-user" v-model="assignUserId" class="input" data-testid="assign-user-input" />
        <p v-if="assignError" class="field-error">{{ assignError }}</p>
      </div>
      <template #footer>
        <button class="btn btn--secondary" @click="assignTicketOpen = false">Cancel</button>
        <button class="btn btn--primary" :disabled="assignSubmitting" @click="submitAssignTicket">
          {{ assignSubmitting ? 'Assigning…' : 'Assign' }}
        </button>
      </template>
    </SidePanel>

    <!-- Reject Compensation Panel -->
    <SidePanel v-model="rejectOpen" title="Reject Compensation">
      <div class="form">
        <label class="field-label" for="reject-notes">Notes</label>
        <textarea id="reject-notes" v-model="rejectNotes" class="textarea" rows="3" data-testid="reject-notes-input" />
      </div>
      <template #footer>
        <button class="btn btn--secondary" @click="rejectOpen = false">Cancel</button>
        <button class="btn btn--primary" @click="submitReject" data-testid="submit-reject">Confirm Reject</button>
      </template>
    </SidePanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import AppDataTable from '../../components/shared/AppDataTable.vue';
import AppTimeline from '../../components/shared/AppTimeline.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import SidePanel from '../../components/shared/SidePanel.vue';
import { afterSalesService, type TicketResponse } from '../../services/after-sales.service.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';

const auth = useAuthStore();
const ui = useUiStore();
const canWrite = computed(() => auth.hasPermission('write:after-sales:*'));
const canApprove = computed(() => auth.hasAnyRole('OpsManager', 'Administrator'));
const isAuditor = computed(() => auth.hasAnyRole('Auditor') && !auth.hasAnyRole('Administrator', 'OpsManager'));

function getOrgId(): string {
  const orgId = auth.user?.orgId;
  if (!orgId) throw new Error('Organization context is required');
  return orgId;
}

const tickets = ref<TicketResponse[]>([]);
const isLoading = ref(false);
const listError = ref<Error | null>(null);
const filters = reactive({ status: 'open', priority: '' });

// Create panel
const createOpen = ref(false);
const createSubmitting = ref(false);
const createError = ref('');
const createForm = reactive({ type: '', priority: 'medium', shipmentId: '', description: '' });

// Detail panel
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<TicketResponse | null>(null);
const noteContent = ref('');
const noteSubmitting = ref(false);
const suggestSubmitting = ref(false);
const evidenceFile = ref<File | null>(null);
const evidenceDescription = ref('');
const evidenceSubmitting = ref(false);

// Assign panel
const assignTicketOpen = ref(false);
const assignUserId = ref('');
const assignError = ref('');
const assignSubmitting = ref(false);

// Reject panel
const rejectOpen = ref(false);
const rejectNotes = ref('');
const rejectSuggestionId = ref('');

async function fetchTickets() {
  isLoading.value = true;
  listError.value = null;
  try {
    const res = await afterSalesService.listTickets(getOrgId(), {
      status: filters.status || undefined,
      priority: filters.priority || undefined,
    });
    tickets.value = res.tickets;
  } catch (e: any) {
    listError.value = e;
  } finally {
    isLoading.value = false;
  }
}

onMounted(fetchTickets);
function reload() { fetchTickets(); }

const ticketColumns = [
  { field: 'id', header: 'ID', searchFields: ['id', 'shipmentId'] },
  { field: 'type', header: 'Type', width: '110px' },
  { field: 'priority', header: 'Priority', width: '90px' },
  { field: 'status', header: 'Status', width: '140px' },
  { field: 'slaDeadlineAt', header: 'SLA Deadline', width: '130px' },
  { field: 'actions', header: '', width: '70px' },
];

function openCreate() {
  Object.assign(createForm, { type: '', priority: 'medium', shipmentId: '', description: '' });
  createError.value = '';
  createOpen.value = true;
}

async function submitCreate() {
  createError.value = '';
  if (!createForm.type) { createError.value = 'Ticket type is required.'; return; }
  if (!createForm.description.trim()) { createError.value = 'Description is required.'; return; }
  createSubmitting.value = true;
  try {
    await afterSalesService.createTicket(getOrgId(), {
      type: createForm.type,
      priority: createForm.priority,
      shipmentId: createForm.shipmentId || undefined,
      description: createForm.description.trim(),
    });
    ui.notifySuccess('Ticket created');
    createOpen.value = false;
    reload();
  } catch (e: any) {
    createError.value = e?.message ?? 'Failed to create ticket.';
  } finally {
    createSubmitting.value = false;
  }
}

async function openDetail(ticket: TicketResponse) {
  detailOpen.value = true;
  detailLoading.value = true;
  noteContent.value = '';
  evidenceFile.value = null;
  evidenceDescription.value = '';
  try {
    detail.value = await afterSalesService.getTicket(ticket.id);
  } catch {
    detail.value = ticket;
  } finally {
    detailLoading.value = false;
  }
}

async function addNote() {
  if (!detail.value || !noteContent.value.trim()) return;
  noteSubmitting.value = true;
  try {
    await afterSalesService.addTimelineNote(detail.value.id, noteContent.value.trim());
    ui.notifySuccess('Note added');
    noteContent.value = '';
    detail.value = await afterSalesService.getTicket(detail.value.id);
  } catch (e: any) {
    ui.notifyError('Failed to add note', e?.message);
  } finally {
    noteSubmitting.value = false;
  }
}

function onEvidenceFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  evidenceFile.value = target.files?.[0] ?? null;
}

async function addEvidenceFile() {
  if (!detail.value || !evidenceFile.value) return;
  evidenceSubmitting.value = true;
  try {
    const uploaded = await afterSalesService.uploadEvidenceFile(evidenceFile.value);
    await afterSalesService.addEvidence(
      detail.value.id,
      uploaded.id,
      evidenceDescription.value.trim() || undefined,
    );
    ui.notifySuccess('Evidence uploaded');
    evidenceFile.value = null;
    evidenceDescription.value = '';
    detail.value = await afterSalesService.getTicket(detail.value.id);
  } catch (e: any) {
    ui.notifyError('Failed to upload evidence', e?.message);
  } finally {
    evidenceSubmitting.value = false;
  }
}

async function suggestCompensation() {
  if (!detail.value) return;
  suggestSubmitting.value = true;
  try {
    const res = await afterSalesService.suggestCompensation(detail.value.id, getOrgId());
    if (res.suggestion) {
      ui.notifySuccess(`Compensation suggestion: $${res.suggestion.suggestedAmount.toFixed(2)}`);
    } else {
      ui.notifyWarn('Compensation cap already reached for this ticket');
    }
    detail.value = await afterSalesService.getTicket(detail.value.id);
  } catch (e: any) {
    ui.notifyError('Failed to suggest compensation', e?.message);
  } finally {
    suggestSubmitting.value = false;
  }
}

async function approveComp(suggestionId: string, decision: 'approved' | 'rejected', notes?: string) {
  if (!detail.value) return;
  try {
    await afterSalesService.approveCompensation(detail.value.id, suggestionId, decision, notes);
    ui.notifySuccess(decision === 'approved' ? 'Compensation approved' : 'Compensation rejected');
    detail.value = await afterSalesService.getTicket(detail.value.id);
  } catch (e: any) {
    ui.notifyError('Failed', e?.message);
  }
}

function openRejectComp(suggestionId: string) {
  rejectSuggestionId.value = suggestionId;
  rejectNotes.value = '';
  rejectOpen.value = true;
}

async function submitReject() {
  await approveComp(rejectSuggestionId.value, 'rejected', rejectNotes.value || undefined);
  rejectOpen.value = false;
}

function openAssignTicket() {
  assignUserId.value = '';
  assignError.value = '';
  assignTicketOpen.value = true;
}

async function submitAssignTicket() {
  if (!detail.value) return;
  if (!assignUserId.value.trim()) { assignError.value = 'User ID is required.'; return; }
  assignSubmitting.value = true;
  try {
    await afterSalesService.assignTicket(detail.value.id, assignUserId.value.trim());
    ui.notifySuccess('Ticket assigned');
    assignTicketOpen.value = false;
    detail.value = await afterSalesService.getTicket(detail.value.id);
  } catch (e: any) {
    ui.notifyError('Failed to assign', e?.message);
  } finally {
    assignSubmitting.value = false;
  }
}

function isSlaOverdue(deadline: string | null): boolean {
  return deadline !== null && new Date(deadline).getTime() < Date.now();
}
function isSlaClose(deadline: string | null): boolean {
  if (!deadline) return false;
  const diff = new Date(deadline).getTime() - Date.now();
  return diff > 0 && diff < 4 * 60 * 60 * 1000; // within 4h
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.view-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
.view-title { font-size: 1.4rem; font-weight: 700; color: #111827; margin: 0; }
.header-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.filter-select { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.35rem 0.6rem; font-size: 0.85rem; }
.btn { padding: 0.5rem 0.9rem; border-radius: 4px; border: 1px solid #d1d5db; font-size: 0.875rem; cursor: pointer; font-weight: 500; }
.btn--primary { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }
.btn--secondary { background: #fff; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-icon { background: transparent; border: 1px solid #d1d5db; border-radius: 4px; padding: 0.35rem 0.6rem; cursor: pointer; }
.btn-sm { font-size: 0.78rem; padding: 0.25rem 0.6rem; border: 1px solid #d1d5db; background: #fff; border-radius: 4px; cursor: pointer; }
.badge { padding: 0.2rem 0.55rem; border-radius: 12px; font-size: 0.72rem; font-weight: 700; text-transform: capitalize; }
.badge--type-delay { background: #fef3c7; color: #92400e; }
.badge--type-dispute { background: #fee2e2; color: #991b1b; }
.badge--type-lost_item { background: #f3e8ff; color: #6b21a8; }
.badge--pri-urgent { background: #fee2e2; color: #991b1b; }
.badge--pri-high { background: #fed7aa; color: #9a3412; }
.badge--pri-medium { background: #fef3c7; color: #92400e; }
.badge--pri-low { background: #f3f4f6; color: #6b7280; }
.badge--status-open { background: #fee2e2; color: #991b1b; }
.badge--status-investigating { background: #dbeafe; color: #1e40af; }
.badge--status-pending_approval { background: #fef3c7; color: #92400e; }
.badge--status-resolved { background: #dcfce7; color: #166534; }
.badge--status-closed { background: #f3f4f6; color: #6b7280; }
.badge--comp-pending { background: #fef3c7; color: #92400e; }
.badge--comp-approved { background: #dcfce7; color: #166534; }
.badge--comp-rejected { background: #fee2e2; color: #991b1b; }
.sla-overdue { color: #ef4444; font-weight: 700; }
.sla-near { color: #f59e0b; font-weight: 600; }
.form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.3rem; }
.field-label { font-size: 0.875rem; font-weight: 500; color: #374151; }
.required { color: #ef4444; }
.input { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.5rem 0.7rem; font-size: 0.875rem; width: 100%; box-sizing: border-box; }
.textarea { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.5rem 0.7rem; font-size: 0.875rem; width: 100%; resize: vertical; box-sizing: border-box; }
.field-error { color: #ef4444; font-size: 0.8rem; margin: 0; }
.detail-body { display: flex; flex-direction: column; gap: 0.75rem; }
.detail-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.sla-row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.875rem; }
.detail-label { color: #6b7280; font-weight: 500; min-width: 80px; }
.detail-row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.875rem; }
.action-group { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.section-title { font-size: 0.9rem; font-weight: 700; color: #374151; margin: 0.5rem 0 0.35rem; }
.comp-item { background: #f9fafb; border-radius: 6px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; }
.comp-header { display: flex; align-items: center; gap: 0.5rem; }
.comp-amount { font-size: 1.1rem; font-weight: 700; color: #111827; }
.comp-reason { font-size: 0.85rem; color: #6b7280; margin: 0; }
.comp-actions { display: flex; gap: 0.4rem; }
.comp-approval { font-size: 0.8rem; color: #6b7280; display: flex; flex-direction: column; gap: 0.2rem; }
.comp-notes { font-style: italic; }
.text-success { color: #166534; font-weight: 600; }
.text-error { color: #991b1b; font-weight: 600; }
.evidence-item { display: flex; align-items: flex-start; gap: 0.6rem; background: #f9fafb; border-radius: 4px; padding: 0.5rem 0.65rem; font-size: 0.85rem; }
.evidence-icon { font-size: 1rem; }
.evidence-desc { font-weight: 500; color: #374151; }
.evidence-meta { color: #9ca3af; font-size: 0.78rem; }
.evidence-upload { display: grid; gap: 0.45rem; }
.note-form { display: flex; flex-direction: column; gap: 0.4rem; }
</style>
