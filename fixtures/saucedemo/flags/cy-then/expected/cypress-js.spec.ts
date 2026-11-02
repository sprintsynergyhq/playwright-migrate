// Migrated from: cypress-js/then-callback.cy.js
import { test } from '@playwright/test';

test.describe('Then Callback', () => {
  test.fixme('reads the title in a then callback', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('[data-test="username"]').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
    // playwright-migrate BLOCK CY_THEN: Callbacks (.then, .each, .spread, should with a function) are not converted. Rewrite the callback with locators and expect.
    // Source lines 7-9:
    //   cy.get('[data-test="title"]').then(($title) => {
    //     expect($title.text()).to.equal('Products');
    //   });
  });
});
