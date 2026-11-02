package com.sprintsynergy.fixtures.saucedemo;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

public class CartBadgeTest {
    private WebDriver driver;

    @BeforeMethod
    public void setUp() {
        driver = new ChromeDriver();
        driver.get("https://www.saucedemo.com/");
        driver.findElement(By.id("user-name")).sendKeys("standard_user");
        driver.findElement(By.id("password")).sendKeys("secret_sauce");
        driver.findElement(By.id("login-button")).click();
    }

    @AfterMethod
    public void tearDown() {
        driver.quit();
    }

    @Test
    public void badgeCountsItems() {
        driver.findElements(By.className("inventory_item")).get(0).findElement(By.tagName("button")).click();
        Assert.assertEquals(driver.findElement(By.className("shopping_cart_badge")).getText(), "1");
        driver.findElements(By.className("inventory_item")).get(5).findElement(By.tagName("button")).click();
        Assert.assertEquals(driver.findElement(By.className("shopping_cart_badge")).getText(), "2");
        driver.findElement(By.name("remove-sauce-labs-backpack")).click();
        Assert.assertEquals(driver.findElement(By.className("shopping_cart_badge")).getText(), "1");
        driver.findElements(By.className("inventory_item")).get(5).findElement(By.tagName("button")).click();
        Assert.assertEquals(driver.findElements(By.className("shopping_cart_badge")).size(), 0);
    }
}
