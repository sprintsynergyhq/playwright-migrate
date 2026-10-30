// Migrated from: cypress-js/cart-badge.cy.js
import { test, expect } from '@playwright/test';

test.describe('Cart Badge', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('[data-test="username"]').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
  });

  test('counts items as they are added and removed', async ({ page }) => {
    await page.locator('[data-test="inventory-item"]').nth(0).locator('button').click();
    await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('1');
    await page.locator('[data-test="inventory-item"]').last().locator('button').click();
    await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('2');
    await page.locator('[data-test="remove-sauce-labs-backpack"]').click();
    await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('1');
    await page.locator('[data-test="inventory-item"]').last().locator('button').click();
    await expect(page.locator('[data-test="shopping-cart-badge"]')).not.toBeAttached();
  });
});
