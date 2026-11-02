// Migrated from: cypress-js/iframe.cy.js
import { test } from '@playwright/test';

test.describe('Iframe Access', () => {
  test.fixme('clicks a button inside an iframe', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    // playwright-migrate BLOCK CY_UNSUPPORTED_COMMAND: Cypress command .its() has no safe Playwright mapping in v0.1. Convert this step by hand.
    // Source line 4: cy.get('iframe').its('0.contentDocument.body').find('button').click();
  });
});
