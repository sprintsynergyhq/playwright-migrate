// Migrated from: cypress-js/intercept.cy.js
import { test, expect } from '@playwright/test';

test.describe('Network Stub', () => {
  test.fixme('waits for an intercepted request', async ({ page }) => {
    // playwright-migrate BLOCK CY_INTERCEPT: cy.intercept is not converted. Rewrite it with page.route or page.waitForResponse, registered before the action that sends the request.
    // Source line 3: cy.intercept('GET', '**/inventory.html').as('inventory');
    await page.goto('https://www.saucedemo.com/');
    await page.locator('[data-test="username"]').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
    // playwright-migrate BLOCK CY_ALIAS: Cypress aliases (.as and cy.wait('@alias')) are not converted. Keep a variable or a page.waitForResponse promise instead.
    // Source line 8: cy.wait('@inventory');
    await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  });
});
