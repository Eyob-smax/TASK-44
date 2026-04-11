import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import LoadingSpinner from '../src/components/shared/LoadingSpinner.vue';
import ErrorState from '../src/components/shared/ErrorState.vue';
import EmptyState from '../src/components/shared/EmptyState.vue';

describe('LoadingSpinner', () => {
  it('renders with role="status"', () => {
    const wrapper = mount(LoadingSpinner);
    expect(wrapper.find('[data-testid="loading-spinner"]').attributes('role')).toBe('status');
  });

  it('shows label when provided', () => {
    const wrapper = mount(LoadingSpinner, { props: { label: 'Loading data…' } });
    expect(wrapper.text()).toContain('Loading data…');
  });

  it('uses label as aria-label when provided', () => {
    const wrapper = mount(LoadingSpinner, { props: { label: 'Fetching records' } });
    expect(wrapper.find('[data-testid="loading-spinner"]').attributes('aria-label')).toBe('Fetching records');
  });

  it('uses default aria-label when no label provided', () => {
    const wrapper = mount(LoadingSpinner);
    expect(wrapper.find('[data-testid="loading-spinner"]').attributes('aria-label')).toBe('Loading');
  });
});

describe('ErrorState', () => {
  it('renders the error message', () => {
    const wrapper = mount(ErrorState, { props: { message: 'Something went wrong' } });
    expect(wrapper.find('[data-testid="error-state"]').text()).toContain('Something went wrong');
  });

  it('has role="alert" for accessibility', () => {
    const wrapper = mount(ErrorState, { props: { message: 'Error' } });
    expect(wrapper.find('[data-testid="error-state"]').attributes('role')).toBe('alert');
  });

  it('shows retry button when onRetry is provided', () => {
    const onRetry = vi.fn();
    const wrapper = mount(ErrorState, { props: { message: 'Error', onRetry } });
    expect(wrapper.find('.retry-btn').exists()).toBe(true);
  });

  it('calls onRetry when retry button is clicked', async () => {
    const onRetry = vi.fn();
    const wrapper = mount(ErrorState, { props: { message: 'Error', onRetry } });
    await wrapper.find('.retry-btn').trigger('click');
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not show retry button when onRetry is not provided', () => {
    const wrapper = mount(ErrorState, { props: { message: 'Error' } });
    expect(wrapper.find('.retry-btn').exists()).toBe(false);
  });
});

describe('EmptyState', () => {
  it('renders the label text', () => {
    const wrapper = mount(EmptyState, { props: { label: 'No records found' } });
    expect(wrapper.find('[data-testid="empty-state"]').text()).toContain('No records found');
  });

  it('renders slot content', () => {
    const wrapper = mount(EmptyState, {
      props: { label: 'Empty' },
      slots: { default: '<button>Add first record</button>' },
    });
    expect(wrapper.text()).toContain('Add first record');
  });
});
