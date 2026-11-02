// Migrated from: selenium-python/test_fixed_wait.py
import { test, expect } from '@playwright/test';

test.describe('TestFixedWait', () => {
  test('test_waits_before_checking_title', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    // playwright-migrate WARN CORE_FIXED_WAIT: Fixed wait kept. Replace it with a web-first assertion on the condition the test needs.
    await page.waitForTimeout(1000);
    await expect(page.locator('.title')).toHaveText('Products');
  });
});
