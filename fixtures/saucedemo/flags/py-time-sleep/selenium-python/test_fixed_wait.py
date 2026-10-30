import time

from selenium import webdriver
from selenium.webdriver.common.by import By


class TestFixedWait:
    def setup_method(self):
        self.driver = webdriver.Chrome()

    def teardown_method(self):
        self.driver.quit()

    def test_waits_before_checking_title(self):
        self.driver.get("https://www.saucedemo.com/")
        self.driver.find_element(By.ID, "user-name").send_keys("standard_user")
        self.driver.find_element(By.ID, "password").send_keys("secret_sauce")
        self.driver.find_element(By.ID, "login-button").click()
        time.sleep(1)
        assert self.driver.find_element(By.CLASS_NAME, "title").text == "Products"
