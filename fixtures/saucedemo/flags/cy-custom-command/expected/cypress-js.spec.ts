// Migrated from: cypress-js/custom-command.cy.js
import { test, expect } from '@playwright/test';

test.describe('Custom Command', () => {
  test.fixme('logs in with a custom command', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    // playwright-migrate BLOCK CY_CUSTOM_COMMAND: Custom command cy.login is not converted. Port it to a helper function or a fixture.
    // Source line 4: cy.login('standard_user', 'secret_sauce');
    await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  });
});
