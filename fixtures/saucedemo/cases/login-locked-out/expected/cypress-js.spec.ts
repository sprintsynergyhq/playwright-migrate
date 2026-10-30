// Migrated from: cypress-js/login-locked-out.cy.js
import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test('shows an error for the locked out user', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('[data-test="username"]').fill('locked_out_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
    await expect(page.locator('[data-test="error"]')).toBeVisible();
    await expect(page.locator('[data-test="error"]')).toContainText(
      'Sorry, this user has been locked out.',
    );
  });
});
