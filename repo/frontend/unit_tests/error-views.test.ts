import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ForbiddenView from '../src/app/views/ForbiddenView.vue';
import NotFoundView from '../src/app/views/NotFoundView.vue';

describe('error views', () => {
  it('ForbiddenView renders code and message', () => {
    const wrapper = mount(ForbiddenView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    expect(wrapper.find('[data-testid="forbidden-page"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('403');
    expect(wrapper.text()).toContain("don't have permission");
  });

  it('NotFoundView renders code and message', () => {
    const wrapper = mount(NotFoundView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    });
    expect(wrapper.find('[data-testid="not-found-page"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('404');
    expect(wrapper.text()).toContain("doesn't exist");
  });
});
