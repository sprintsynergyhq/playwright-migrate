// Migrated from: selenium-python/test_switch_frame.py
import { test, expect } from '@playwright/test';

test.fixme('test_clicks_button_in_frame', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');
  // playwright-migrate BLOCK CORE_FRAME: Frame switching is not converted. Use page.frameLocator for the steps inside the frame.
  // Source line 15: driver.switch_to.frame("payment-frame")
  // playwright-migrate BLOCK CORE_FRAME: Frame switching is not converted. Use page.frameLocator for the steps inside the frame.
  // Source line 16: driver.find_element(By.ID, "pay").click()
  // playwright-migrate BLOCK CORE_FRAME: Frame switching is not converted. Use page.frameLocator for the steps inside the frame.
  // Source line 17: driver.switch_to.default_content()
  await expect(page).toHaveURL(/saucedemo/);
});
