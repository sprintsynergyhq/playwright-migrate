// Migrated from: selenium-java/SwitchFrameTest.java
import { test, expect } from '@playwright/test';

test.describe('SwitchFrameTest', () => {
  test.fixme('clicksButtonInFrame', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    // playwright-migrate BLOCK CORE_FRAME: Frame switching is not converted. Use page.frameLocator for the steps inside the frame.
    // Source line 27: driver.switchTo().frame("payment-frame");
    // playwright-migrate BLOCK CORE_FRAME: Frame switching is not converted. Use page.frameLocator for the steps inside the frame.
    // Source line 28: driver.findElement(By.id("pay")).click();
    // playwright-migrate BLOCK CORE_FRAME: Frame switching is not converted. Use page.frameLocator for the steps inside the frame.
    // Source line 29: driver.switchTo().defaultContent();
    await expect(page).toHaveURL(/saucedemo/);
  });
});
