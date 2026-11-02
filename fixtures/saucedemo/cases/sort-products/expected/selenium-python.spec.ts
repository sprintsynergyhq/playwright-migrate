// Migrated from: selenium-python/test_sort_products.py
import { test, expect } from '@playwright/test';

test.describe('TestSortProducts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
  });

  test('test_sort_by_price_low_to_high', async ({ page }) => {
    await page.locator('.product_sort_container').selectOption({ value: 'lohi' });
    await expect(page.locator('.product_sort_container')).toHaveValue('lohi');
    await expect(page.locator('.inventory_item_price').nth(0)).toHaveText('$7.99');
    await expect(page.locator('.inventory_item_price').last()).toHaveText('$49.99');
  });
});
