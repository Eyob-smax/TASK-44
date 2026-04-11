<template>
  <div class="view" data-testid="memberships-view">
    <div class="view-header">
      <h2 class="view-title">Memberships &amp; Commerce</h2>
      <div class="tab-bar" role="tablist">
        <button
          v-for="tab in TABS"
          :key="tab"
          :class="['tab-btn', { 'tab-btn--active': activeTab === tab }]"
          role="tab"
          :aria-selected="activeTab === tab"
          @click="activeTab = tab"
          :data-testid="`tab-${tab}`"
        >{{ tab }}</button>
      </div>
    </div>

    <!-- Members tab -->
    <template v-if="activeTab === 'Members'">
      <div class="section-header">
        <div class="filter-row">
          <input
            v-model="memberSearch"
            class="search-input"
            placeholder="Search members…"
            aria-label="Search members"
            data-testid="member-search"
          />
          <select v-model="tierFilter" class="filter-select" aria-label="Filter by tier">
            <option value="">All tiers</option>
            <option v-for="t in tiers" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <button v-if="canWrite" class="btn btn--primary" @click="openCreateMember" data-testid="btn-create-member">
          + Add Member
        </button>
      </div>

      <LoadingSpinner v-if="membersLoading" label="Loading members…" />
      <ErrorState v-else-if="membersError" :message="membersError.message" :on-retry="fetchMembers" />
      <AppDataTable
        v-else
        :columns="memberColumns"
        :rows="members as any"
        row-key="id"
        :searchable="false"
        empty-label="No members found"
      >
        <template #tierLevel="{ value, row }">{{ row.tierName }} (L{{ value }})</template>
        <template #walletBalance="{ value }">
          {{ value !== null ? `$${value.toFixed(2)}` : '—' }}
        </template>
        <template #growthPoints="{ value }">{{ value }} pts</template>
        <template #actions="{ row }">
          <button class="btn-sm" @click="openMemberDetail(row.id)" data-testid="btn-member-detail">Manage</button>
        </template>
      </AppDataTable>
    </template>

    <!-- Tiers tab -->
    <template v-else-if="activeTab === 'Tiers'">
      <LoadingSpinner v-if="tiersLoading" label="Loading tiers…" />
      <ErrorState v-else-if="tiersError" :message="tiersError.message" :on-retry="fetchTiers" />
      <AppDataTable
        v-else
        :columns="tierColumns"
        :rows="tiers as any"
        row-key="id"
        :searchable="false"
        empty-label="No tiers configured"
      >
        <template #benefits="{ value }">
          <span class="benefits-preview">{{ tryParseJson(value) }}</span>
        </template>
      </AppDataTable>
    </template>

    <!-- Fulfillment tab -->
    <template v-else-if="activeTab === 'Fulfillment'">
      <div class="fulfillment-form-card" data-testid="fulfillment-form">
        <h3 class="card-title">Create Fulfillment</h3>
        <div class="form">
          <div class="field">
            <label class="field-label" for="ful-member">Member ID (optional)</label>
            <input id="ful-member" v-model="fulfillForm.memberId" class="input" placeholder="Leave blank for guest" />
          </div>
          <div class="field">
            <label class="field-label" for="ful-coupon">Coupon Code</label>
            <input id="ful-coupon" v-model="fulfillForm.couponCode" class="input" placeholder="Optional" data-testid="coupon-input" />
          </div>
          <div class="field">
            <label class="field-label">
              <input type="checkbox" v-model="fulfillForm.useWallet" data-testid="use-wallet-checkbox" />
              Pay with wallet balance
            </label>
          </div>

          <div class="line-items-section">
            <div class="parcels-header">
              <span class="field-label">Line Items <span class="required">*</span></span>
              <button class="btn-sm" @click="addLineItem" type="button">+ Add Item</button>
            </div>
            <div
              v-for="(item, idx) in fulfillForm.lineItems"
              :key="idx"
              class="line-item-row"
              :data-testid="`line-item-${idx}`"
            >
              <input v-model="item.description" class="input" placeholder="Description" data-testid="item-description" />
              <input v-model.number="item.unitPrice" class="input input--sm" type="number" min="0.01" step="0.01" placeholder="Price" data-testid="item-price" />
              <input v-model.number="item.quantity" class="input input--xs" type="number" min="1" placeholder="Qty" data-testid="item-qty" />
              <button class="btn-remove" @click="fulfillForm.lineItems.splice(idx, 1)">×</button>
            </div>
          </div>

          <div v-if="fulfillResult" class="fulfillment-result" data-testid="fulfillment-result">
            <div class="result-row"><span>Subtotal</span><span>${{ fulfillResult.totalAmount.toFixed(2) }}</span></div>
            <div class="result-row" v-if="fulfillResult.discountAmount > 0">
              <span>Discount</span><span class="text-success">−${{ fulfillResult.discountAmount.toFixed(2) }}</span>
            </div>
            <div class="result-row" v-if="fulfillResult.shippingFee > 0">
              <span>Shipping</span><span>${{ fulfillResult.shippingFee.toFixed(2) }}</span>
            </div>
            <div class="result-row result-row--total">
              <span>Total</span><span>${{ fulfillResult.finalAmount.toFixed(2) }}</span>
            </div>
          </div>

          <p v-if="fulfillError" class="field-error" role="alert" data-testid="fulfillment-error">{{ fulfillError }}</p>
          <button
            class="btn btn--primary"
            :disabled="fulfillSubmitting"
            @click="submitFulfillment"
            data-testid="submit-fulfillment"
          >{{ fulfillSubmitting ? 'Processing…' : 'Create Fulfillment' }}</button>
        </div>
      </div>
    </template>

    <!-- Create Member Panel -->
    <SidePanel v-model="createMemberOpen" title="Add Member">
      <div class="form">
        <div class="field">
          <label class="field-label" for="cm-student">Student ID</label>
          <input id="cm-student" v-model="createMemberForm.studentId" class="input" placeholder="Optional" />
        </div>
        <div class="field">
          <label class="field-label" for="cm-tier">Tier <span class="required">*</span></label>
          <select id="cm-tier" v-model="createMemberForm.tierId" class="input" data-testid="tier-select">
            <option value="">Select tier…</option>
            <option v-for="t in tiers" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <p v-if="createMemberError" class="field-error">{{ createMemberError }}</p>
      </div>
      <template #footer>
        <button class="btn btn--secondary" @click="createMemberOpen = false">Cancel</button>
        <button class="btn btn--primary" :disabled="createMemberSubmitting" @click="submitCreateMember" data-testid="submit-create-member">
          {{ createMemberSubmitting ? 'Adding…' : 'Add Member' }}
        </button>
      </template>
    </SidePanel>

    <!-- Member Detail Panel -->
    <SidePanel v-model="memberDetailOpen" title="Member">
      <LoadingSpinner v-if="memberDetailLoading" label="Loading member…" />
      <div v-else-if="memberDetail" class="detail-body" data-testid="member-detail">
        <div class="kpi-row-sm">
          <div class="mini-kpi">
            <div class="mini-kpi-label">Tier</div>
            <div class="mini-kpi-val">{{ memberDetail.tierName }}</div>
          </div>
          <div class="mini-kpi">
            <div class="mini-kpi-label">Growth Points</div>
            <div class="mini-kpi-val">{{ memberDetail.growthPoints }}</div>
          </div>
          <div class="mini-kpi" v-if="wallet">
            <div class="mini-kpi-label">Wallet Balance</div>
            <div class="mini-kpi-val">${{ wallet.balance.toFixed(2) }}</div>
          </div>
        </div>

        <!-- Wallet operations (write role only, not Auditor) -->
        <template v-if="canWrite && !isAuditor">
          <h4 class="section-title">Wallet Top-Up</h4>
          <div class="wallet-form">
            <input
              v-model.number="topUpAmount"
              class="input"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount ($)"
              data-testid="topup-amount-input"
            />
            <button
              class="btn btn--primary"
              :disabled="walletSubmitting || !topUpAmount || topUpAmount <= 0"
              @click="submitTopUp"
              data-testid="submit-topup"
            >{{ walletSubmitting ? 'Processing…' : 'Top Up' }}</button>
          </div>

          <h4 class="section-title">Wallet Spend</h4>
          <div class="wallet-form">
            <input
              v-model.number="spendAmount"
              class="input"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount ($)"
              data-testid="spend-amount-input"
            />
            <button
              class="btn btn--secondary"
              :disabled="walletSubmitting || !spendAmount || spendAmount <= 0"
              @click="submitSpend"
              data-testid="submit-spend"
            >{{ walletSubmitting ? 'Processing…' : 'Spend' }}</button>
          </div>
          <p v-if="walletError" class="field-error" role="alert" data-testid="wallet-error">{{ walletError }}</p>
        </template>
        <div v-else class="readonly-notice" data-testid="readonly-notice">Read-only access</div>

        <!-- Last transaction -->
        <div v-if="wallet?.lastTransactionAt" class="detail-row">
          <span class="detail-label">Last Transaction</span>
          <span>{{ new Date(wallet.lastTransactionAt).toLocaleDateString() }}</span>
        </div>
      </div>
    </SidePanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import AppDataTable from '../../components/shared/AppDataTable.vue';
import LoadingSpinner from '../../components/shared/LoadingSpinner.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import SidePanel from '../../components/shared/SidePanel.vue';
import {
  membershipsService,
  type MemberResponse,
  type MembershipTierResponse,
  type WalletBalanceResponse,
  type FulfillmentResponse,
} from '../../services/memberships.service.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { generateIdempotencyKey } from '../../utils/idempotency.js';

const auth = useAuthStore();
const ui = useUiStore();
const canWrite = computed(() => auth.hasPermission('write:memberships:*'));
const isAuditor = computed(() => auth.hasAnyRole('Auditor') && !auth.hasAnyRole('Administrator', 'OpsManager'));

function getOrgId(): string {
  const orgId = auth.user?.orgId;
  if (!orgId) throw new Error('Organization context is required');
  return orgId;
}
const TABS = ['Members', 'Tiers', 'Fulfillment'] as const;
type Tab = (typeof TABS)[number];
const activeTab = ref<Tab>('Members');

// Members
const members = ref<MemberResponse[]>([]);
const membersLoading = ref(false);
const membersError = ref<Error | null>(null);
const memberSearch = ref('');
const tierFilter = ref('');

// Tiers
const tiers = ref<MembershipTierResponse[]>([]);
const tiersLoading = ref(false);
const tiersError = ref<Error | null>(null);

// Create Member
const createMemberOpen = ref(false);
const createMemberForm = reactive({ studentId: '', tierId: '' });
const createMemberError = ref('');
const createMemberSubmitting = ref(false);

// Member Detail
const memberDetailOpen = ref(false);
const memberDetailLoading = ref(false);
const memberDetail = ref<MemberResponse | null>(null);
const wallet = ref<WalletBalanceResponse | null>(null);
const topUpAmount = ref<number | null>(null);
const spendAmount = ref<number | null>(null);
const walletSubmitting = ref(false);
const walletError = ref('');

// Fulfillment
const fulfillForm = reactive({
  memberId: '',
  couponCode: '',
  useWallet: false,
  lineItems: [{ description: '', unitPrice: 0, quantity: 1 }] as {
    description: string;
    unitPrice: number;
    quantity: number;
  }[],
});
const fulfillResult = ref<FulfillmentResponse | null>(null);
const fulfillError = ref('');
const fulfillSubmitting = ref(false);

async function fetchMembers() {
  membersLoading.value = true;
  membersError.value = null;
  try {
    const res = await membershipsService.listMembers(getOrgId(), {
      search: memberSearch.value || undefined,
      tierId: tierFilter.value || undefined,
    });
    members.value = res.members;
  } catch (e: any) {
    membersError.value = e;
  } finally {
    membersLoading.value = false;
  }
}

async function fetchTiers() {
  tiersLoading.value = true;
  tiersError.value = null;
  try {
    tiers.value = await membershipsService.listTiers(getOrgId());
  } catch (e: any) {
    tiersError.value = e;
  } finally {
    tiersLoading.value = false;
  }
}

onMounted(async () => {
  await Promise.all([fetchMembers(), fetchTiers()]);
});

const memberColumns = [
  { field: 'id', header: 'Member ID', searchFields: ['id', 'studentId'] },
  { field: 'tierLevel', header: 'Tier', width: '130px' },
  { field: 'growthPoints', header: 'Points', width: '90px' },
  { field: 'walletBalance', header: 'Wallet', width: '100px' },
  { field: 'joinedAt', header: 'Joined', width: '110px' },
  { field: 'actions', header: '', width: '80px' },
];

const tierColumns = [
  { field: 'name', header: 'Tier Name' },
  { field: 'level', header: 'Level', width: '70px' },
  { field: 'pointsThreshold', header: 'Points Needed', width: '130px' },
  { field: 'benefits', header: 'Benefits' },
];

function openCreateMember() {
  Object.assign(createMemberForm, { studentId: '', tierId: '' });
  createMemberError.value = '';
  createMemberOpen.value = true;
}

async function submitCreateMember() {
  if (!createMemberForm.tierId) { createMemberError.value = 'Tier is required.'; return; }
  createMemberSubmitting.value = true;
  try {
    await membershipsService.createMember(getOrgId(), {
      studentId: createMemberForm.studentId || undefined,
      tierId: createMemberForm.tierId,
    });
    ui.notifySuccess('Member added');
    createMemberOpen.value = false;
    fetchMembers();
  } catch (e: any) {
    createMemberError.value = e?.message ?? 'Failed.';
  } finally {
    createMemberSubmitting.value = false;
  }
}

async function openMemberDetail(memberId: string) {
  memberDetailOpen.value = true;
  memberDetailLoading.value = true;
  walletError.value = '';
  topUpAmount.value = null;
  spendAmount.value = null;
  try {
    const [m, w] = await Promise.all([
      membershipsService.getMember(memberId),
      membershipsService.getWallet(memberId).catch(() => null),
    ]);
    memberDetail.value = m;
    wallet.value = w;
  } finally {
    memberDetailLoading.value = false;
  }
}

async function submitTopUp() {
  if (!memberDetail.value || !topUpAmount.value || topUpAmount.value <= 0) return;
  walletError.value = '';
  walletSubmitting.value = true;
  try {
    const res = await membershipsService.topUpWallet(memberDetail.value.id, topUpAmount.value, generateIdempotencyKey());
    ui.notifySuccess(`Topped up $${res.ledgerEntry.amount.toFixed(2)} — Receipt ${res.receipt.receiptNumber}`);
    wallet.value = await membershipsService.getWallet(memberDetail.value.id);
    topUpAmount.value = null;
  } catch (e: any) {
    walletError.value = e?.message ?? 'Top-up failed.';
  } finally {
    walletSubmitting.value = false;
  }
}

async function submitSpend() {
  if (!memberDetail.value || !spendAmount.value || spendAmount.value <= 0) return;
  walletError.value = '';
  walletSubmitting.value = true;
  try {
    const res = await membershipsService.spendFromWallet(memberDetail.value.id, spendAmount.value, generateIdempotencyKey());
    ui.notifySuccess(`Spent $${res.ledgerEntry.amount.toFixed(2)} — Receipt ${res.receipt.receiptNumber}`);
    wallet.value = await membershipsService.getWallet(memberDetail.value.id);
    spendAmount.value = null;
  } catch (e: any) {
    walletError.value = e?.message ?? 'Insufficient balance or other error.';
  } finally {
    walletSubmitting.value = false;
  }
}

function addLineItem() {
  fulfillForm.lineItems.push({ description: '', unitPrice: 0, quantity: 1 });
}

async function submitFulfillment() {
  fulfillError.value = '';
  if (fulfillForm.lineItems.length === 0) { fulfillError.value = 'Add at least one line item.'; return; }
  if (fulfillForm.lineItems.some((i) => !i.description.trim())) { fulfillError.value = 'All items need a description.'; return; }
  if (fulfillForm.lineItems.some((i) => i.unitPrice <= 0)) { fulfillError.value = 'All items need a price > 0.'; return; }
  fulfillSubmitting.value = true;
  try {
    const result = await membershipsService.createFulfillment(getOrgId(), {
      memberId: fulfillForm.memberId || undefined,
      idempotencyKey: generateIdempotencyKey(),
      lineItems: fulfillForm.lineItems.map((i) => ({ ...i })),
      couponCode: fulfillForm.couponCode || undefined,
      useWallet: fulfillForm.useWallet || undefined,
    });
    fulfillResult.value = result;
    ui.notifySuccess(`Fulfillment confirmed — Total: $${result.finalAmount.toFixed(2)}`);
  } catch (e: any) {
    fulfillError.value = e?.message ?? 'Fulfillment failed.';
    fulfillResult.value = null;
  } finally {
    fulfillSubmitting.value = false;
  }
}

function tryParseJson(val: string): string {
  try {
    const obj = JSON.parse(val);
    return Array.isArray(obj) ? obj.join(', ') : JSON.stringify(obj);
  } catch {
    return val;
  }
}
</script>

<style scoped>
.view-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
.view-title { font-size: 1.4rem; font-weight: 700; color: #111827; margin: 0; }
.tab-bar { display: flex; background: #f3f4f6; border-radius: 6px; padding: 3px; gap: 2px; }
.tab-btn { border: none; background: transparent; padding: 0.3rem 0.9rem; border-radius: 4px; font-size: 0.85rem; font-weight: 500; cursor: pointer; color: #6b7280; }
.tab-btn--active { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem; }
.filter-row { display: flex; gap: 0.5rem; align-items: center; }
.filter-select { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.35rem 0.6rem; font-size: 0.85rem; }
.search-input { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.4rem 0.7rem; font-size: 0.875rem; width: 220px; }
.btn { padding: 0.5rem 0.9rem; border-radius: 4px; border: 1px solid #d1d5db; font-size: 0.875rem; cursor: pointer; font-weight: 500; }
.btn--primary { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }
.btn--secondary { background: #fff; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-sm { font-size: 0.78rem; padding: 0.25rem 0.6rem; border: 1px solid #d1d5db; background: #fff; border-radius: 4px; cursor: pointer; }
.benefits-preview { font-size: 0.8rem; color: #6b7280; }
.fulfillment-form-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); padding: 1.5rem; max-width: 600px; }
.card-title { font-size: 1rem; font-weight: 700; color: #111827; margin: 0 0 1.25rem; }
.form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.3rem; }
.field-label { font-size: 0.875rem; font-weight: 500; color: #374151; }
.required { color: #ef4444; }
.input { border: 1px solid #d1d5db; border-radius: 4px; padding: 0.5rem 0.7rem; font-size: 0.875rem; width: 100%; box-sizing: border-box; }
.input--sm { max-width: 90px; }
.input--xs { max-width: 60px; }
.line-items-section { display: flex; flex-direction: column; gap: 0.5rem; }
.parcels-header { display: flex; align-items: center; justify-content: space-between; }
.line-item-row { display: flex; gap: 0.4rem; align-items: center; }
.btn-remove { background: transparent; border: none; color: #ef4444; font-size: 1.1rem; cursor: pointer; padding: 0 0.25rem; }
.fulfillment-result { background: #f9fafb; border-radius: 6px; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
.result-row { display: flex; justify-content: space-between; font-size: 0.875rem; color: #374151; }
.result-row--total { font-weight: 700; font-size: 1rem; padding-top: 0.4rem; border-top: 1px solid #e5e7eb; }
.text-success { color: #166534; }
.field-error { color: #ef4444; font-size: 0.8rem; margin: 0; }
.detail-body { display: flex; flex-direction: column; gap: 0.75rem; }
.kpi-row-sm { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.mini-kpi { background: #f9fafb; border-radius: 6px; padding: 0.6rem 0.8rem; min-width: 90px; }
.mini-kpi-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; font-weight: 600; }
.mini-kpi-val { font-size: 1.1rem; font-weight: 700; color: #111827; }
.section-title { font-size: 0.9rem; font-weight: 700; color: #374151; margin: 0.5rem 0 0.35rem; }
.wallet-form { display: flex; gap: 0.5rem; align-items: center; }
.wallet-form .input { width: 140px; }
.readonly-notice { font-size: 0.85rem; color: #9ca3af; font-style: italic; padding: 0.5rem 0; }
.detail-row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.875rem; }
.detail-label { color: #6b7280; font-weight: 500; min-width: 120px; }
</style>
