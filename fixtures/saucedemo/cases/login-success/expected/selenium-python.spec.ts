// Migrated from: selenium-python/test_login_success.py
import { test, expect } from '@playwright/test';

test.describe('TestLoginSuccess', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
  });

  test('test_login_with_standard_user', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('#login-button').click();
    await expect(page).toHaveURL(/\/inventory\.html/);
    await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  });
});
