// Migrated from: cypress-js/dropped-test.cy.js
import { test, expect } from '@playwright/test';

// playwright-migrate BLOCK CORE_UNKNOWN_STATEMENT: Statement not recognized, so it was not converted. Convert it by hand.
// Source lines 7-11:
//   it('uses a done callback', (done) => {
//     cy.visit('https://www.saucedemo.com/');
//     cy.get('[data-test="username"]').should('be.visible');
//     done();
//   });

test.describe('Dropped Test', () => {
  test('shows the login button', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await expect(page.locator('[data-test="login-button"]')).toBeVisible();
  });
});
