// Migrated from: cypress-js/wait-time.cy.js
import { test, expect } from '@playwright/test';

test.describe('Fixed Wait', () => {
  test('waits a fixed time before checking the title', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('[data-test="username"]').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
    // playwright-migrate WARN CORE_FIXED_WAIT: Fixed wait kept. Replace it with a web-first assertion on the condition the test needs.
    await page.waitForTimeout(500);
    await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  });
});
