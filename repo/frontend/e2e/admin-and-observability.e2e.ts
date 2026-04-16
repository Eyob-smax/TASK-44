import { test, expect } from '@playwright/test';

async function login(page: Parameters<typeof test>[0]['page'], username: string, password: string) {
  await page.goto('/login');
  await page.getByTestId('username-input').fill(username);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
}

test.describe('Admin and observability journeys', () => {
  test('admin can open admin modules and observability pages', async ({ page }) => {
    await login(page, 'demo.admin', 'password');
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/admin');
    await expect(page.getByTestId('admin-view')).toBeVisible();
    await expect(page.getByText('Students')).toBeVisible();
    await expect(page.getByText('Backups')).toBeVisible();

    await page.goto('/observability');
    await expect(page.getByTestId('observability-view')).toBeVisible();
    await expect(page.getByText('Metrics')).toBeVisible();
    await expect(page.getByText('Notifications')).toBeVisible();
  });
});
