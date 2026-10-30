import unittest

from selenium import webdriver
from selenium.webdriver.common.by import By


class TestCartBadge(unittest.TestCase):
    def setUp(self):
        self.driver = webdriver.Chrome()
        self.driver.get("https://www.saucedemo.com/")
        self.driver.find_element(By.ID, "user-name").send_keys("standard_user")
        self.driver.find_element(By.ID, "password").send_keys("secret_sauce")
        self.driver.find_element(By.ID, "login-button").click()

    def tearDown(self):
        self.driver.quit()

    def test_badge_counts_items(self):
        self.driver.find_elements(By.CLASS_NAME, "inventory_item")[0].find_element(By.TAG_NAME, "button").click()
        self.assertEqual(self.driver.find_element(By.CLASS_NAME, "shopping_cart_badge").text, "1")
        self.driver.find_elements(By.CLASS_NAME, "inventory_item")[-1].find_element(By.TAG_NAME, "button").click()
        self.assertEqual(self.driver.find_element(By.CLASS_NAME, "shopping_cart_badge").text, "2")
        self.driver.find_element(By.NAME, "remove-sauce-labs-backpack").click()
        self.assertEqual(self.driver.find_element(By.CLASS_NAME, "shopping_cart_badge").text, "1")
        self.driver.find_elements(By.CLASS_NAME, "inventory_item")[-1].find_element(By.TAG_NAME, "button").click()
        self.assertEqual(len(self.driver.find_elements(By.CLASS_NAME, "shopping_cart_badge")), 0)


if __name__ == "__main__":
    unittest.main()
