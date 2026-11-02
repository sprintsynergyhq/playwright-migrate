// Migrated from: selenium-python/test_add_to_cart.py
import { test, expect } from '@playwright/test';

test('test_add_backpack_to_cart', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');
  await page.locator('#user-name').fill('standard_user');
  await page.locator('#password').fill('secret_sauce');
  await page.locator('#login-button').click();
  await page.locator('#add-to-cart-sauce-labs-backpack').click();
  await expect(page.locator('#remove-sauce-labs-backpack')).toBeVisible();
  await page.locator('.shopping_cart_link').click();
  await expect(page).toHaveURL(/\/cart\.html/);
  await expect(page.locator('.cart_item')).toHaveCount(1);
  await expect(page.locator('.cart_item').nth(0).locator('.inventory_item_name')).toHaveText(
    'Sauce Labs Backpack',
  );
});
