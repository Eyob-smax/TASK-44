<template>
  <div class="data-table-wrapper" data-testid="data-table">
    <!-- Search bar -->
    <div v-if="searchable" class="table-toolbar">
      <input
        v-model="searchQuery"
        type="search"
        :placeholder="searchPlaceholder ?? 'Search…'"
        class="search-input"
        data-testid="table-search"
        aria-label="Search table"
      />
      <span class="row-count" data-testid="row-count">
        {{ filteredRows.length }} {{ filteredRows.length === 1 ? 'row' : 'rows' }}
      </span>
    </div>

    <!-- Table -->
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col.field"
              :style="col.width ? `width:${col.width}` : ''"
              scope="col"
            >
              {{ col.header }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, idx) in filteredRows"
            :key="rowKey ? String((row as any)[rowKey]) : idx"
            data-testid="table-row"
          >
            <td v-for="col in columns" :key="col.field">
              <slot :name="col.field" :row="row" :value="(row as any)[col.field]">
                {{ (row as any)[col.field] ?? '—' }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty state -->
    <div v-if="filteredRows.length === 0" class="table-empty" data-testid="table-empty">
      <slot name="empty">
        <EmptyState :label="emptyLabel ?? 'No records found'" />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import EmptyState from './EmptyState.vue';

export interface TableColumn {
  field: string;
  header: string;
  /** Optional fixed width e.g. "120px" */
  width?: string;
  /** Fields to include in search for this column (defaults to column field) */
  searchFields?: string[];
}

const props = defineProps<{
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  rowKey?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
}>();

const searchQuery = ref('');

const filteredRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q || !props.searchable) return props.rows;

  return props.rows.filter((row) =>
    props.columns.some((col) => {
      const fields = col.searchFields ?? [col.field];
      return fields.some((f) => String((row as any)[f] ?? '').toLowerCase().includes(q));
    }),
  );
});
</script>

<style scoped>
.data-table-wrapper {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.table-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f0f0f0;
}

.search-input {
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0.45rem 0.7rem;
  font-size: 0.875rem;
  outline: none;
  flex: 1;
  max-width: 320px;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: #6495ed;
  box-shadow: 0 0 0 2px rgba(100, 149, 237, 0.2);
}

.row-count {
  font-size: 0.8rem;
  color: #9ca3af;
  white-space: nowrap;
}

.table-scroll {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.data-table th {
  padding: 0.65rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  background: #fafafa;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
}

.data-table td {
  padding: 0.65rem 1rem;
  border-bottom: 1px solid #f3f4f6;
  color: #374151;
  vertical-align: middle;
}

.data-table tbody tr:hover {
  background: #f9fafb;
}

.table-empty {
  padding: 2rem;
}
</style>
