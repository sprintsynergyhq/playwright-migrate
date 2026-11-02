package com.sprintsynergy.fixtures.saucedemo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;

// The login-success case with fully qualified Selenium types and no driver imports.
class LoginSuccessTest {
    private org.openqa.selenium.WebDriver driver;

    @BeforeEach
    void setUp() {
        driver = new org.openqa.selenium.chrome.ChromeDriver();
        driver.get("https://www.saucedemo.com/");
    }

    @AfterEach
    void tearDown() {
        driver.quit();
    }

    @Test
    void loginWithStandardUser() {
        driver.findElement(By.id("user-name")).sendKeys("standard_user");
        driver.findElement(By.cssSelector("[data-test=\"password\"]")).sendKeys("secret_sauce");
        driver.findElement(By.id("login-button")).click();
        assertTrue(driver.getCurrentUrl().contains("/inventory.html"));
        assertEquals("Products", driver.findElement(By.cssSelector("[data-test=\"title\"]")).getText());
    }
}
