from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


class TestCheckoutComplete:
    def setup_method(self):
        self.driver = webdriver.Chrome()
        self.driver.implicitly_wait(5)

    def teardown_method(self):
        self.driver.quit()

    def test_complete_checkout_for_one_item(self):
        self.driver.get("https://www.saucedemo.com/")
        self.driver.find_element(By.ID, "user-name").send_keys("standard_user")
        self.driver.find_element(By.ID, "password").send_keys("secret_sauce")
        self.driver.find_element(By.ID, "login-button").click()
        self.driver.find_element(By.ID, "add-to-cart-sauce-labs-backpack").click()
        self.driver.find_element(By.CLASS_NAME, "shopping_cart_link").click()
        self.driver.find_element(By.ID, "checkout").click()
        self.driver.find_element(By.ID, "first-name").send_keys("Ada")
        self.driver.find_element(By.ID, "last-name").send_keys("Lovelace")
        self.driver.find_element(By.ID, "postal-code").send_keys("10001")
        self.driver.find_element(By.ID, "continue").click()
        WebDriverWait(self.driver, 10).until(EC.url_contains("/checkout-step-two.html"))
        WebDriverWait(self.driver, 10).until(EC.element_to_be_clickable((By.ID, "finish"))).click()
        assert "/checkout-complete.html" in self.driver.current_url
        assert self.driver.find_element(By.CLASS_NAME, "complete-header").text == "Thank you for your order!"
