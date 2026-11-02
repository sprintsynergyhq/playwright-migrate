// Migrated from: cypress-js/only-skip.cy.js
import { test, expect } from '@playwright/test';

// playwright-migrate WARN CY_ONLY: it.only was converted to a normal it, because Playwright test.only would skip every other test in the run. Add .only back by hand if you need it.
// Source line 4: it.only

test.describe('Only And Skip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
  });

  test('shows the login button', async ({ page }) => {
    await expect(page.locator('[data-test="login-button"]')).toBeVisible();
  });

  test('shows the username field', async ({ page }) => {
    await expect(page.locator('[data-test="username"]')).toBeVisible();
  });

  test.skip('is skipped for now', async ({ page }) => {
    await expect(page.locator('[data-test="password"]')).toBeVisible();
  });
});
