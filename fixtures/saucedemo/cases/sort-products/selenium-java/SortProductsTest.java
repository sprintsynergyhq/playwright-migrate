package com.sprintsynergy.fixtures.saucedemo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.Select;

class SortProductsTest {
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
    void sortByPriceLowToHigh() {
        new Select(driver.findElement(By.className("product_sort_container"))).selectByVisibleText("Price (low to high)");
        assertEquals("lohi", driver.findElement(By.className("product_sort_container")).getAttribute("value"));
        List<WebElement> prices = driver.findElements(By.className("inventory_item_price"));
        assertEquals("$7.99", prices.get(0).getText());
        assertEquals("$49.99", prices.get(prices.size() - 1).getText());
    }
}
