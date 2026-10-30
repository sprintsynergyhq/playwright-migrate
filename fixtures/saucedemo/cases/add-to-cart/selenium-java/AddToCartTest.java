package com.sprintsynergy.fixtures.saucedemo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;

class AddToCartTest {
    private WebDriver driver;

    @BeforeEach
    void setUp() {
        driver = new ChromeDriver();
        driver.get("https://www.saucedemo.com/");
        driver.findElement(By.id("user-name")).sendKeys("standard_user");
        driver.findElement(By.id("password")).sendKeys("secret_sauce");
        driver.findElement(By.id("login-button")).click();
    }

    @AfterEach
    void tearDown() {
        driver.quit();
    }

    @Test
    void addBackpackToCart() {
        driver.findElement(By.id("add-to-cart-sauce-labs-backpack")).click();
        assertTrue(driver.findElement(By.id("remove-sauce-labs-backpack")).isDisplayed());
        driver.findElement(By.className("shopping_cart_link")).click();
        assertTrue(driver.getCurrentUrl().contains("/cart.html"));
        List<WebElement> items = driver.findElements(By.className("cart_item"));
        assertEquals(1, items.size());
        assertEquals("Sauce Labs Backpack", items.get(0).findElement(By.className("inventory_item_name")).getText());
    }
}
