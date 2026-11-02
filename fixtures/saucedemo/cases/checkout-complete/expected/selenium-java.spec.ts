// Migrated from: selenium-java/CheckoutCompleteTest.java
import { test, expect } from '@playwright/test';

test.describe('CheckoutCompleteTest', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
  });

  test('completeCheckoutForOneItem', async ({ page }) => {
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    await page.locator('#add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await page.locator('#checkout').click();
    await page.locator('#first-name').fill('Ada');
    await page.locator('#last-name').fill('Lovelace');
    await page.locator('#postal-code').fill('10001');
    await page.locator('#continue').click();
    await expect(page).toHaveURL(/\/checkout-step-two\.html/);
    await page.locator('#finish').click();
    await expect(page).toHaveURL(/\/checkout-complete\.html/);
    await expect(page.locator('.complete-header')).toHaveText('Thank you for your order!');
  });
});
