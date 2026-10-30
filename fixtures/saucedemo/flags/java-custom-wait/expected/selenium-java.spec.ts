// Migrated from: selenium-java/CustomWaitTest.java
import { test } from '@playwright/test';

test.describe('CustomWaitTest', () => {
  test.fixme('waitsWithALambda', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    // playwright-migrate BLOCK CORE_CUSTOM_WAIT: Wait with a custom condition is not converted. Rewrite it as a web-first assertion.
    // Source lines 32-33:
    //   new WebDriverWait(driver, Duration.ofSeconds(10))
    //           .until(d -> d.findElement(By.className("title")).getText().equals("Products"));
  });
});
