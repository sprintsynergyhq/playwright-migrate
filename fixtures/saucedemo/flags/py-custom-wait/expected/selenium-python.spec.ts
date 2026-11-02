// Migrated from: selenium-python/test_custom_wait.py
import { test } from '@playwright/test';

test.fixme('test_waits_with_a_lambda', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');
  await page.locator('#user-name').fill('standard_user');
  await page.locator('#password').fill('secret_sauce');
  await page.locator('#login-button').click();
  // playwright-migrate BLOCK CORE_CUSTOM_WAIT: Wait with a custom condition is not converted. Rewrite it as a web-first assertion.
  // Source line 19: WebDriverWait(driver, 10).until(lambda d: d.find_element(By.CLASS_NAME, "title").text == "Products")
});
