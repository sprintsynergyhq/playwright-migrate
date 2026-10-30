// Migrated from: selenium-python/test_login_locked_out.py
import { test, expect } from '@playwright/test';

test('test_locked_out_user_sees_error', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');
  await page.locator('#user-name').fill('locked_out_user');
  await page.locator('[data-test="password"]').fill('secret_sauce');
  await page.locator('#login-button').click();
  await expect(page.locator('[data-test="error"]')).toBeVisible();
  await expect(page.locator('[data-test="error"]')).toContainText(
    'Sorry, this user has been locked out.',
  );
});
