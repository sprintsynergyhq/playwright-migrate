// Migrated from: selenium-java/CartBadgeTest.java
import { test, expect } from '@playwright/test';

test.describe('CartBadgeTest', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
  });

  test('badgeCountsItems', async ({ page }) => {
    await page.locator('.inventory_item').nth(0).locator('button').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
    await page.locator('.inventory_item').nth(5).locator('button').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('2');
    await page.locator('[name="remove-sauce-labs-backpack"]').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
    await page.locator('.inventory_item').nth(5).locator('button').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveCount(0);
  });
});
