// Migrated from: selenium-java/LoginSuccessTest.java
import { test, expect } from '@playwright/test';

test.describe('LoginSuccessTest', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
  });

  test('loginWithStandardUser', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('#login-button').click();
    await expect(page).toHaveURL(/\/inventory\.html/);
    await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  });
});
