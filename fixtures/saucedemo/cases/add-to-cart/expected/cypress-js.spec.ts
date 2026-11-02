// Migrated from: cypress-js/add-to-cart.cy.js
import { test, expect } from '@playwright/test';

test.describe('Cart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('[data-test="username"]').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
  });

  test('adds the backpack to the cart', async ({ page }) => {
    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    await expect(page.locator('[data-test="remove-sauce-labs-backpack"]')).toBeVisible();
    await page.locator('[data-test="shopping-cart-link"]').click();
    await expect(page).toHaveURL(/\/cart\.html/);
    await expect(page.locator('[data-test="inventory-item"]')).toHaveCount(1);
    await expect(
      page
        .locator('[data-test="inventory-item"]')
        .first()
        .locator('[data-test="inventory-item-name"]'),
    ).toHaveText('Sauce Labs Backpack');
  });
});
