// Migrated from: selenium-python/test_execute_script.py
import { test, expect } from '@playwright/test';

test.fixme('test_scrolls_with_javascript', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');
  await page.locator('#user-name').fill('standard_user');
  await page.locator('#password').fill('secret_sauce');
  await page.locator('#login-button').click();
  // playwright-migrate BLOCK CORE_JS_EXECUTOR: JavaScript executor calls are not converted. Use a Playwright action, or page.evaluate after review.
  // Source line 18: driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
  await expect(page.locator('.footer')).toBeVisible();
});
