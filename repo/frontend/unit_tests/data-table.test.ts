import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppDataTable from '../src/components/shared/AppDataTable.vue';

const COLUMNS = [
  { field: 'name', header: 'Name' },
  { field: 'status', header: 'Status' },
];

const ROWS = [
  { name: 'Alice Smith', status: 'active' },
  { name: 'Bob Jones', status: 'inactive' },
  { name: 'Carol Brown', status: 'active' },
];

function buildTable(props: Record<string, unknown> = {}) {
  return mount(AppDataTable, {
    props: {
      columns: COLUMNS,
      rows: ROWS,
      ...props,
    },
  });
}

describe('AppDataTable rendering', () => {
  it('renders column headers', () => {
    const wrapper = buildTable();
    expect(wrapper.text()).toContain('Name');
    expect(wrapper.text()).toContain('Status');
  });

  it('renders all rows when no search query', () => {
    const wrapper = buildTable();
    const rows = wrapper.findAll('[data-testid="table-row"]');
    expect(rows).toHaveLength(3);
  });

  it('renders row values', () => {
    const wrapper = buildTable();
    expect(wrapper.text()).toContain('Alice Smith');
    expect(wrapper.text()).toContain('Bob Jones');
  });

  it('shows row count in toolbar when searchable', () => {
    const wrapper = buildTable({ searchable: true });
    expect(wrapper.find('[data-testid="row-count"]').text()).toBe('3 rows');
  });

  it('does not show search bar when searchable is false', () => {
    const wrapper = buildTable({ searchable: false });
    expect(wrapper.find('[data-testid="table-search"]').exists()).toBe(false);
  });
});

describe('AppDataTable filtering', () => {
  it('filters rows when search query matches name', async () => {
    const wrapper = buildTable({ searchable: true });
    const input = wrapper.find('[data-testid="table-search"]');

    await input.setValue('Alice');

    const rows = wrapper.findAll('[data-testid="table-row"]');
    expect(rows).toHaveLength(1);
    expect(wrapper.text()).toContain('Alice Smith');
    expect(wrapper.text()).not.toContain('Bob Jones');
  });

  it('filter is case-insensitive', async () => {
    const wrapper = buildTable({ searchable: true });
    await wrapper.find('[data-testid="table-search"]').setValue('ALICE');

    const rows = wrapper.findAll('[data-testid="table-row"]');
    expect(rows).toHaveLength(1);
  });

  it('shows empty state when filter matches nothing', async () => {
    const wrapper = buildTable({ searchable: true });
    await wrapper.find('[data-testid="table-search"]').setValue('xyzzy');

    expect(wrapper.findAll('[data-testid="table-row"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="table-empty"]').exists()).toBe(true);
  });

  it('shows empty state when rows is empty', () => {
    const wrapper = mount(AppDataTable, {
      props: { columns: COLUMNS, rows: [], searchable: false, emptyLabel: 'Nothing here' },
    });
    expect(wrapper.find('[data-testid="table-empty"]').exists()).toBe(true);
  });

  it('updates row count after filtering', async () => {
    const wrapper = buildTable({ searchable: true });
    await wrapper.find('[data-testid="table-search"]').setValue('active');
    // Search is substring-based, so "active" also matches "inactive".
    const count = wrapper.find('[data-testid="row-count"]').text();
    expect(count).toContain('3');
  });
});
