package com.sprintsynergy.fixtures.saucedemo;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

public class SwitchFrameTest {
    private WebDriver driver;

    @BeforeMethod
    public void setUp() {
        driver = new ChromeDriver();
    }

    @AfterMethod
    public void tearDown() {
        driver.quit();
    }

    @Test
    public void clicksButtonInFrame() {
        driver.get("https://www.saucedemo.com/");
        driver.switchTo().frame("payment-frame");
        driver.findElement(By.id("pay")).click();
        driver.switchTo().defaultContent();
        Assert.assertTrue(driver.getCurrentUrl().contains("saucedemo"));
    }
}
