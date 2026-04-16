import { test, expect } from '@playwright/test';

async function login(page: Parameters<typeof test>[0]['page'], username: string, password: string) {
  await page.goto('/login');
  await page.getByTestId('username-input').fill(username);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('login-submit').click();
}

test.describe('Frontend-to-backend auth journeys', () => {
  test('admin can sign in, reach dashboard, and sign out', async ({ page }) => {
    await login(page, 'demo.admin', 'password');

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('dashboard-view')).toBeVisible();
    await expect(page.getByTestId('user-info')).toContainText('Administrator');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('viewer is blocked from admin route and redirected to forbidden page', async ({ page }) => {
    await login(page, 'demo.viewer', 'password');

    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(page.getByTestId('forbidden-page')).toBeVisible();
    await expect(page.getByText("You don't have permission to access this page.")).toBeVisible();
  });

  test('admin can create and inspect an after-sales ticket through the UI', async ({ page }) => {
    await login(page, 'demo.admin', 'password');

    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/after-sales');
    await expect(page.getByTestId('after-sales-view')).toBeVisible();

    await page.getByTestId('btn-create-ticket').click();
    await expect(page.getByTestId('create-ticket-form')).toBeVisible();

    const description = `Playwright ticket ${Date.now()}`;
    await page.getByTestId('ticket-type-select').selectOption('delay');
    await page.getByTestId('ticket-description').fill(description);
    await page.getByTestId('submit-create-ticket').click();

    await expect(page.getByTestId('create-ticket-form')).toBeHidden();
    await expect(page.getByTestId('btn-ticket-detail').first()).toBeVisible();

    await page.getByTestId('btn-ticket-detail').first().click();
    await expect(page.getByTestId('ticket-detail')).toBeVisible();

    const note = `Playwright note ${Date.now()}`;
    await page.getByTestId('note-input').fill(note);
    await page.getByTestId('btn-add-note').click();
    await expect(page.getByText(note)).toBeVisible();
  });
});
