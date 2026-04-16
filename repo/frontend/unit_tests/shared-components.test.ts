import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import KpiCard from '../src/components/shared/KpiCard.vue';
import AppTimeline from '../src/components/shared/AppTimeline.vue';
import EmptyState from '../src/components/shared/EmptyState.vue';
import ErrorState from '../src/components/shared/ErrorState.vue';
import LoadingSpinner from '../src/components/shared/LoadingSpinner.vue';
import SidePanel from '../src/components/shared/SidePanel.vue';

describe('shared components', () => {
  it('KpiCard renders value and alert style', () => {
    const wrapper = mount(KpiCard, { props: { label: 'Errors', value: 7, alert: true } });
    expect(wrapper.find('[data-testid="kpi-card"]').classes()).toContain('kpi-card--alert');
    expect(wrapper.find('[data-testid="kpi-value"]').text()).toBe('7');
  });

  it('AppTimeline renders entries and empty state correctly', () => {
    const filled = mount(AppTimeline, {
      props: {
        entries: [{ id: '1', type: 'status_change', content: 'Moved', createdAt: new Date().toISOString(), userId: 'u1' }],
      },
    });
    expect(filled.findAll('[data-testid="timeline-entry"]').length).toBe(1);

    const empty = mount(AppTimeline, { props: { entries: [] } });
    expect(empty.find('[data-testid="timeline-empty"]').exists()).toBe(true);
  });

  it('EmptyState and LoadingSpinner render labels', () => {
    const empty = mount(EmptyState, { props: { label: 'Nothing to show' } });
    expect(empty.text()).toContain('Nothing to show');

    const spinner = mount(LoadingSpinner, { props: { label: 'Loading feed' } });
    expect(spinner.attributes('aria-label')).toBe('Loading feed');
  });

  it('ErrorState invokes retry callback', async () => {
    const onRetry = vi.fn();
    const wrapper = mount(ErrorState, { props: { message: 'Failed', onRetry } });
    await wrapper.get('button.retry-btn').trigger('click');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('SidePanel emits close on overlay and close button', async () => {
    const wrapper = mount(SidePanel, {
      props: { modelValue: true, title: 'Panel' },
      global: { stubs: { Teleport: true, Transition: false } },
    });

    await wrapper.find('.side-panel-overlay').trigger('click');
    await wrapper.find('.panel-close').trigger('click');

    const emits = wrapper.emitted('update:modelValue') ?? [];
    expect(emits.length).toBeGreaterThanOrEqual(2);
    expect(emits[0]).toEqual([false]);
  });
});
