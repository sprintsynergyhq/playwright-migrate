from selenium import webdriver
from selenium.webdriver.common.by import By


class TestLoginSuccess:
    def setup_method(self):
        self.driver = webdriver.Chrome()
        self.driver.get("https://www.saucedemo.com/")

    def teardown_method(self):
        self.driver.quit()

    def test_login_with_standard_user(self):
        self.driver.find_element(By.ID, "user-name").send_keys("standard_user")
        self.driver.find_element(By.CSS_SELECTOR, '[data-test="password"]').send_keys("secret_sauce")
        self.driver.find_element(By.ID, "login-button").click()
        assert "/inventory.html" in self.driver.current_url
        assert self.driver.find_element(By.CSS_SELECTOR, '[data-test="title"]').text == "Products"
