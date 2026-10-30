import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By


@pytest.fixture
def driver():
    driver = webdriver.Chrome()
    yield driver
    driver.quit()


def test_clicks_button_in_frame(driver):
    driver.get("https://www.saucedemo.com/")
    driver.switch_to.frame("payment-frame")
    driver.find_element(By.ID, "pay").click()
    driver.switch_to.default_content()
    assert "saucedemo" in driver.current_url
