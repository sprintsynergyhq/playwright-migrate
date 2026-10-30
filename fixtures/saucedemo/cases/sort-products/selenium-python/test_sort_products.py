from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select


class TestSortProducts:
    def setup_method(self):
        self.driver = webdriver.Chrome()
        self.driver.get("https://www.saucedemo.com/")
        self.driver.find_element(By.ID, "user-name").send_keys("standard_user")
        self.driver.find_element(By.ID, "password").send_keys("secret_sauce")
        self.driver.find_element(By.ID, "login-button").click()

    def teardown_method(self):
        self.driver.quit()

    def test_sort_by_price_low_to_high(self):
        Select(self.driver.find_element(By.CLASS_NAME, "product_sort_container")).select_by_value("lohi")
        assert self.driver.find_element(By.CLASS_NAME, "product_sort_container").get_attribute("value") == "lohi"
        prices = self.driver.find_elements(By.CLASS_NAME, "inventory_item_price")
        assert prices[0].text == "$7.99"
        assert prices[-1].text == "$49.99"
