import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertSource } from '../../src/core/convert.js';
import { toGoldenReport } from '../../src/core/report.js';
import { loginLockedOutIr } from '../ir-fixtures/login-locked-out.js';
import { loginSuccessIr } from '../ir-fixtures/login-success.js';

// Wraps body lines in a pytest test that takes the driver fixture. The first body line is
// source line 2.
const wrap = (...body: string[]): string =>
  ['def test_t(driver):', ...body.map((l) => `    ${l}`), ''].join('\n');

async function convert(text: string) {
  const result = await convertSource('selenium-python', 'test_t.py', text, null);
  const golden = toGoldenReport(result.report);
  return {
    file: result.file,
    spec: result.spec,
    status: golden.status,
    counts: golden.counts,
    flags: golden.flags.map((f) => `${f.level} ${f.ruleId} ${f.line}`),
    tests: golden.tests.map((x) => `${x.title}: ${x.status}`),
  };
}

describe('selenium-python extractor', () => {
  it.each([
    ['login-success', loginSuccessIr],
    ['login-locked-out', loginLockedOutIr],
  ] as const)('builds the hand-built IR for %s', async (id, build) => {
    const expected = build()['selenium-python'];
    const file = `fixtures/saucedemo/cases/${id}/${expected.sourcePath}`;
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const result = await convertSource('selenium-python', expected.sourcePath, text, null);
    expect(result.file).toEqual(expected);
  });

  it('maps navigation and the By locators', async () => {
    const r = await convert(
      wrap(
        'driver.get("https://www.saucedemo.com/")',
        'driver.refresh()',
        'driver.back()',
        'driver.forward()',
        'driver.find_element(By.ID, "a").click()',
        'driver.find_element(By.CSS_SELECTOR, "div > b").click()',
        'driver.find_element(By.NAME, "n").clear()',
        'driver.find_element(By.TAG_NAME, "BUTTON").click()',
        'driver.find_element(By.LINK_TEXT, "About").click()',
        'driver.find_element(By.PARTIAL_LINK_TEXT, "Abo").click()',
        'driver.find_element(By.XPATH, "//button").click()',
      ),
    );
    expect(r.spec).toContain("await page.goto('https://www.saucedemo.com/');");
    expect(r.spec).toContain('await page.reload();');
    expect(r.spec).toContain('await page.goBack();');
    expect(r.spec).toContain('await page.goForward();');
    expect(r.spec).toContain("await page.locator('#a').click();");
    expect(r.spec).toContain("await page.locator('div > b').click();");
    expect(r.spec).toContain('await page.locator(\'[name="n"]\').clear();');
    expect(r.spec).toContain("await page.locator('button').click();");
    expect(r.spec).toContain(
      "await page.getByRole('link', { name: 'About', exact: true }).click();",
    );
    expect(r.spec).toContain("await page.getByRole('link', { name: 'Abo' }).click();");
    expect(r.flags).toEqual([
      'INFO CORE_TEXT_LOCATOR 10',
      'INFO CORE_TEXT_LOCATOR 11',
      'INFO CORE_XPATH 12',
    ]);
  });

  it('maps send_keys with a string to fill and with Keys to press', async () => {
    const r = await convert(
      wrap(
        'driver.find_element(By.ID, "a").send_keys("x")',
        'driver.find_element(By.ID, "a").send_keys(Keys.ENTER)',
        'driver.find_element(By.ID, "a").send_keys("a" + "b")',
      ),
    );
    expect(r.spec).toContain("await page.locator('#a').fill('x');");
    expect(r.spec).toContain("await page.locator('#a').press('Enter');");
    expect(r.flags).toEqual(['INFO CORE_FILL_REPLACES_VALUE 2', 'BLOCK CORE_UNKNOWN_STATEMENT 4']);
  });

  it('maps Select by value, visible text and index', async () => {
    const r = await convert(
      wrap(
        'Select(driver.find_element(By.ID, "s")).select_by_value("lohi")',
        'Select(driver.find_element(By.ID, "s")).select_by_visible_text("Price (low to high)")',
        'Select(driver.find_element(By.ID, "s")).select_by_index(2)',
      ),
    );
    expect(r.spec).toContain("await page.locator('#s').selectOption({ value: 'lohi' });");
    expect(r.spec).toContain(
      "await page.locator('#s').selectOption({ label: 'Price (low to high)' });",
    );
    expect(r.spec).toContain("await page.locator('#s').selectOption({ index: 2 });");
    expect(r.status).toBe('converted');
  });

  it('maps assert statements and drops assert messages with an INFO flag', async () => {
    const r = await convert(
      wrap(
        'assert driver.title == "Swag Labs"',
        'assert "/inventory" in driver.current_url',
        'assert "Products" not in driver.find_element(By.ID, "t").text',
        'assert not driver.find_element(By.ID, "e").is_displayed()',
        'assert driver.find_element(By.ID, "b").is_enabled(), "button is enabled"',
        'assert driver.find_element(By.ID, "i").get_attribute("value") != "x"',
        'assert len(driver.find_elements(By.CLASS_NAME, "row")) == 6',
      ),
    );
    expect(r.spec).toContain("await expect(page).toHaveTitle('Swag Labs');");
    expect(r.spec).toContain('await expect(page).toHaveURL(/\\/inventory/);');
    expect(r.spec).toContain("await expect(page.locator('#t')).not.toContainText('Products');");
    expect(r.spec).toContain("await expect(page.locator('#e')).toBeHidden();");
    expect(r.spec).toContain("await expect(page.locator('#b')).toBeEnabled();");
    expect(r.spec).toContain("await expect(page.locator('#i')).not.toHaveValue('x');");
    expect(r.spec).toContain("await expect(page.locator('.row')).toHaveCount(6);");
    expect(r.flags).toEqual(['INFO CORE_ASSERT_MESSAGE_DROPPED 6']);
    expect(r.counts.sourceAssertions).toBe(7);
    expect(r.counts.outputExpects).toBe(7);
  });

  it('maps unittest assertions and blocks the ones it does not support', async () => {
    const text = [
      'import unittest',
      '',
      'class TestT(unittest.TestCase):',
      '    def setUp(self):',
      '        self.driver = webdriver.Chrome()',
      '',
      '    def test_t(self):',
      '        self.assertEqual(self.driver.title, "Swag Labs")',
      '        self.assertIn("/inventory", self.driver.current_url)',
      '        self.assertTrue(self.driver.find_element(By.ID, "c").is_selected())',
      '        self.assertFalse(self.driver.find_element(By.ID, "b").is_enabled(), "msg")',
      '        self.assertRegex(self.driver.title, "Swag")',
      '        self.assertEqual(self.driver.title.lower(), "swag labs")',
      '',
    ].join('\n');
    const r = await convert(text);
    expect(r.spec).toContain("await expect(page).toHaveTitle('Swag Labs');");
    expect(r.spec).toContain('await expect(page).toHaveURL(/\\/inventory/);');
    expect(r.spec).toContain("await expect(page.locator('#c')).toBeChecked();");
    expect(r.spec).toContain("await expect(page.locator('#b')).toBeDisabled();");
    expect(r.flags).toEqual([
      'INFO CORE_DRIVER_LIFECYCLE 5',
      'INFO CORE_ASSERT_MESSAGE_DROPPED 11',
      'BLOCK CORE_UNSUPPORTED_ASSERTION 12',
      'BLOCK CORE_UNSUPPORTED_ASSERTION 13',
    ]);
    expect(r.counts.sourceAssertions).toBe(6);
    expect(r.counts.outputExpects).toBe(4);
    expect(r.counts.blockedAssertions).toBe(2);
    expect(r.tests).toEqual(['TestT > test_t: blocked']);
  });

  it('maps expected-condition waits and removes the wait object', async () => {
    const r = await convert(
      wrap(
        'wait = WebDriverWait(driver, 10)',
        'wait.until(EC.visibility_of_element_located((By.ID, "a")))',
        'wait.until(EC.invisibility_of_element_located((By.ID, "b")))',
        'wait.until_not(EC.url_contains("/cart"))',
        'wait.until(EC.title_is("Swag Labs"))',
        'wait.until(EC.text_to_be_present_in_element((By.ID, "c"), "Done"))',
      ),
    );
    expect(r.spec).toContain("await expect(page.locator('#a')).toBeVisible();");
    expect(r.spec).toContain("await expect(page.locator('#b')).toBeHidden();");
    expect(r.spec).toContain('await expect(page).not.toHaveURL(/\\/cart/);');
    expect(r.spec).toContain("await expect(page).toHaveTitle('Swag Labs');");
    expect(r.spec).toContain("await expect(page.locator('#c')).toContainText('Done');");
    expect(r.flags).toEqual(['INFO CORE_WAIT_OBJECT 2']);
  });

  it('removes a clickable wait only before an action on the same element', async () => {
    const r = await convert(
      wrap(
        'WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.ID, "a")))',
        'driver.find_element(By.ID, "a").click()',
        'WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.ID, "b")))',
        'driver.find_element(By.ID, "c").click()',
        'WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.ID, "d"))).click()',
      ),
    );
    expect(r.flags).toEqual([
      'INFO CORE_CLICKABLE_WAIT_REMOVED 2',
      'BLOCK CORE_CUSTOM_WAIT 4',
      'INFO CORE_CLICKABLE_WAIT_REMOVED 6',
    ]);
    expect(r.spec).toContain("await page.locator('#d').click();");
  });

  it('blocks lambda waits, alerts, windows, frames and the JavaScript executor', async () => {
    const r = await convert(
      wrap(
        'WebDriverWait(driver, 5).until(lambda d: d.title == "x")',
        'WebDriverWait(driver, 5).until(EC.alert_is_present())',
        'driver.switch_to.window(driver.window_handles[1])',
        'driver.switch_to.frame("f")',
        'driver.find_element(By.ID, "a").click()',
        'driver.switch_to.default_content()',
        'driver.execute_script("return 1")',
        'driver.find_element(By.ID, "z").click()',
      ),
    );
    expect(r.flags).toEqual([
      'BLOCK CORE_CUSTOM_WAIT 2',
      'BLOCK CORE_WINDOW 3',
      'BLOCK CORE_WINDOW 4',
      'BLOCK CORE_FRAME 5',
      'BLOCK CORE_FRAME 6',
      'BLOCK CORE_FRAME 7',
      'BLOCK CORE_JS_EXECUTOR 8',
    ]);
    expect(r.spec).toContain("await page.locator('#z').click();");
    expect(r.tests).toEqual(['test_t: blocked']);
  });

  it('keeps time.sleep as a fixed wait with a WARN flag', async () => {
    const r = await convert(wrap('time.sleep(1.5)'));
    expect(r.spec).toContain('await page.waitForTimeout(1500);');
    expect(r.flags).toEqual(['WARN CORE_FIXED_WAIT 2']);
  });

  it('removes stored elements, implicit waits and window size calls with INFO flags', async () => {
    const r = await convert(
      wrap(
        'driver.implicitly_wait(5)',
        'driver.maximize_window()',
        'items = driver.find_elements(By.CSS_SELECTOR, ".item")',
        'items[0].click()',
        'items[-1].click()',
        'error = WebDriverWait(driver, 5).until(EC.visibility_of_element_located((By.ID, "e")))',
        'assert error.text == "Oops"',
      ),
    );
    expect(r.spec).toContain("await page.locator('.item').nth(0).click();");
    expect(r.spec).toContain("await page.locator('.item').last().click();");
    expect(r.spec).toContain("await expect(page.locator('#e')).toBeVisible();");
    expect(r.spec).toContain("await expect(page.locator('#e')).toHaveText('Oops');");
    expect(r.flags).toEqual([
      'INFO CORE_IMPLICIT_WAIT 2',
      'INFO CORE_WINDOW_SIZE 3',
      'INFO CORE_STORED_ELEMENT 4',
      'INFO CORE_STORED_ELEMENT 7',
    ]);
  });

  it('reads plain, raw and escaped strings and blocks f-strings', async () => {
    const r = await convert(
      wrap(
        'driver.find_element(By.ID, "a").send_keys(r"C:\\new")',
        "driver.find_element(By.ID, 'b').send_keys('it\\'s')",
        'driver.find_element(By.ID, "c").send_keys(f"{name}")',
      ),
    );
    expect(r.spec).toContain("await page.locator('#a').fill('C:\\\\new');");
    expect(r.spec).toContain("await page.locator('#b').fill(\"it's\");");
    expect(r.flags).toContain('BLOCK CORE_UNKNOWN_STATEMENT 4');
  });

  it('flags the driver fixture and the main guard as INFO file flags', async () => {
    const text = [
      'import pytest',
      '',
      '@pytest.fixture',
      'def browser():',
      '    browser = webdriver.Chrome()',
      '    yield browser',
      '    browser.quit()',
      '',
      'def test_t(browser):',
      '    browser.get("https://www.saucedemo.com/")',
      '',
      'if __name__ == "__main__":',
      '    pytest.main()',
      '',
    ].join('\n');
    const r = await convert(text);
    expect(r.flags).toEqual(['INFO CORE_DRIVER_LIFECYCLE 3', 'INFO PY_MAIN_GUARD 12']);
    expect(r.spec).toContain("await page.goto('https://www.saucedemo.com/');");
    expect(r.status).toBe('converted');
  });

  it('converts skip decorators to skipped tests and suites', async () => {
    const text = [
      'import pytest',
      '',
      '@pytest.mark.skip(reason="later")',
      'def test_a(driver):',
      '    driver.get("https://www.saucedemo.com/")',
      '',
      '@unittest.skip("later")',
      'class TestB(unittest.TestCase):',
      '    def test_b(self):',
      '        pass',
      '',
    ].join('\n');
    const r = await convert(text);
    expect(r.spec).toContain("test.skip('test_a', async ({ page }) => {");
    expect(r.spec).toContain("test.describe.skip('TestB', () => {");
    expect(r.counts.tests).toBe(2);
  });

  it('lists and counts dropped tests, members and helper functions', async () => {
    const text = [
      'import pytest',
      '',
      'def login(driver):',
      '    driver.find_element(By.ID, "login-button").click()',
      '',
      '@pytest.mark.parametrize("user", ["a", "b"])',
      'def test_param(driver, user):',
      '    assert user',
      '',
      'class TestS:',
      '    base = "https://www.saucedemo.com/"',
      '',
      '    def helper(self):',
      '        assert True',
      '',
      '    class TestInner:',
      '        def test_inner(self):',
      '            assert True',
      '',
      '    def test_kept(self, driver):',
      '        driver.get("https://www.saucedemo.com/")',
      '',
    ].join('\n');
    const r = await convert(text);
    expect(r.flags).toEqual([
      'BLOCK CORE_UNKNOWN_STATEMENT 3',
      'BLOCK CORE_UNKNOWN_STATEMENT 6',
      'BLOCK CORE_UNSUPPORTED_MEMBER 11',
      'BLOCK CORE_UNSUPPORTED_MEMBER 13',
      'BLOCK CORE_UNSUPPORTED_MEMBER 16',
    ]);
    expect(r.tests).toEqual([
      'test_param: blocked',
      'TestS > TestInner > test_inner: blocked',
      'TestS > test_kept: blocked',
    ]);
    expect(r.counts.tests).toBe(3);
    expect(r.counts.sourceAssertions).toBe(3);
    expect(r.counts.blockedAssertions).toBe(3);
    expect(r.file.sourceTests).toBe(3);
    expect(r.spec).toContain('// Source lines 3-4:\n//   def login(driver):\n');
    expect(r.spec).toContain('Class member class TestInner is not converted.');
    expect(r.status).toBe('blocked');
  });

  it('marks every test fixme when setup outside the tests is dropped', async () => {
    const text = [
      'import unittest',
      'from selenium import webdriver',
      'from selenium.webdriver.common.by import By',
      '',
      'class T(unittest.TestCase):',
      '    @classmethod',
      '    def setUpClass(cls):',
      '        cls.base = "https://www.saucedemo.com/"',
      '',
      '    def setUp(self):',
      '        self.driver = webdriver.Chrome()',
      '',
      '    def test_kept(self):',
      '        self.driver.get("https://www.saucedemo.com/")',
      '',
    ].join('\n');
    const r = await convert(text);
    expect(r.flags).toEqual(['BLOCK CORE_UNSUPPORTED_MEMBER 6', 'INFO CORE_DRIVER_LIFECYCLE 11']);
    expect(r.tests).toEqual(['T > test_kept: blocked']);
    expect(r.spec).toContain("test.fixme('test_kept'");
    expect(r.spec).toContain('// playwright-migrate: code outside this test was not converted');
    expect(r.spec).not.toMatch(/^\s*test\('/m);
  });

  it('marks every test fixme when a module-level statement is dropped', async () => {
    const text = [
      'from selenium import webdriver',
      'from selenium.webdriver.common.by import By',
      'driver = webdriver.Chrome()',
      'driver.get("https://www.saucedemo.com/")',
      '',
      'def test_x(driver):',
      '    driver.get("https://www.saucedemo.com/")',
      '',
    ].join('\n');
    const r = await convert(text);
    expect(r.tests).toEqual(['test_x: blocked']);
    expect(r.spec).toContain("test.fixme('test_x'");
  });

  it('blocks a test that takes a parameter that is not a driver fixture', async () => {
    const r = await convert('def test_t(page):\n    page.goto("x")\n');
    expect(r.flags).toEqual(['BLOCK CORE_UNKNOWN_STATEMENT 1']);
    expect(r.tests).toEqual(['test_t: blocked']);
  });
});
