import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertSource } from '../../src/core/convert.js';
import { toGoldenReport } from '../../src/core/report.js';
import { loginLockedOutIr } from '../ir-fixtures/login-locked-out.js';
import { loginSuccessIr } from '../ir-fixtures/login-success.js';

// Wraps body lines in a JUnit 5 test class with a driver field. The first body line is source
// line 5.
const wrap = (...body: string[]): string =>
  [
    'class T {',
    '    private WebDriver driver;',
    '    @Test',
    '    void t() {',
    ...body.map((l) => `        ${l}`),
    '    }',
    '}',
    '',
  ].join('\n');

async function convert(text: string) {
  const result = await convertSource('selenium-java', 'T.java', text, null);
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

describe('selenium-java extractor', () => {
  it.each([
    ['login-success', loginSuccessIr],
    ['login-locked-out', loginLockedOutIr],
  ] as const)('builds the hand-built IR for %s', async (id, build) => {
    const expected = build()['selenium-java'];
    const file = `fixtures/saucedemo/cases/${id}/${expected.sourcePath}`;
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const result = await convertSource('selenium-java', expected.sourcePath, text, null);
    expect(result.file).toEqual(expected);
  });

  it('maps navigation and the By locators', async () => {
    const r = await convert(
      wrap(
        'driver.get("https://www.saucedemo.com/");',
        'driver.navigate().refresh();',
        'driver.navigate().back();',
        'this.driver.navigate().forward();',
        'driver.findElement(By.id("a")).click();',
        'driver.findElement(By.cssSelector("div > b")).click();',
        'driver.findElement(By.name("n")).clear();',
        'driver.findElement(By.tagName("BUTTON")).click();',
        'driver.findElement(By.linkText("About")).click();',
        'driver.findElement(By.partialLinkText("Abo")).click();',
        'driver.findElement(By.xpath("//button")).click();',
        'driver.navigate().to("https://www.saucedemo.com/cart.html");',
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
    expect(r.spec).toContain("await page.goto('https://www.saucedemo.com/cart.html');");
    expect(r.flags).toEqual([
      'INFO CORE_TEXT_LOCATOR 13',
      'INFO CORE_TEXT_LOCATOR 14',
      'INFO CORE_XPATH 15',
    ]);
  });

  it('maps sendKeys with a string to fill and with Keys to press', async () => {
    const r = await convert(
      wrap(
        'driver.findElement(By.id("a")).sendKeys("x");',
        'driver.findElement(By.id("a")).sendKeys(Keys.ENTER);',
        'driver.findElement(By.id("a")).sendKeys("a" + "b");',
      ),
    );
    expect(r.spec).toContain("await page.locator('#a').fill('x');");
    expect(r.spec).toContain("await page.locator('#a').press('Enter');");
    expect(r.flags).toEqual(['INFO CORE_FILL_REPLACES_VALUE 5', 'BLOCK CORE_UNKNOWN_STATEMENT 7']);
  });

  it('maps Select by value, visible text and index', async () => {
    const r = await convert(
      wrap(
        'new Select(driver.findElement(By.id("s"))).selectByValue("lohi");',
        'new Select(driver.findElement(By.id("s"))).selectByVisibleText("Price (low to high)");',
        'new Select(driver.findElement(By.id("s"))).selectByIndex(2);',
      ),
    );
    expect(r.spec).toContain("await page.locator('#s').selectOption({ value: 'lohi' });");
    expect(r.spec).toContain(
      "await page.locator('#s').selectOption({ label: 'Price (low to high)' });",
    );
    expect(r.spec).toContain("await page.locator('#s').selectOption({ index: 2 });");
    expect(r.status).toBe('converted');
  });

  it('reads JUnit 5 and TestNG argument order and drops messages with an INFO flag', async () => {
    const r = await convert(
      wrap(
        'assertEquals("Swag Labs", driver.getTitle());',
        'Assert.assertEquals(driver.getTitle(), "Swag Labs");',
        'assertTrue(driver.getCurrentUrl().contains("/inventory"));',
        'assertFalse(driver.findElement(By.id("t")).getText().contains("Products"));',
        'assertFalse(driver.findElement(By.id("e")).isDisplayed());',
        'Assertions.assertTrue(driver.findElement(By.id("b")).isEnabled(), "button is enabled");',
        'assertNotEquals("x", driver.findElement(By.id("i")).getAttribute("value"));',
        'assertEquals(6, driver.findElements(By.className("row")).size());',
        'assertTrue(!driver.findElement(By.id("c")).isSelected());',
        'assertTrue(driver.getTitle().equals("Swag Labs"));',
      ),
    );
    expect(r.spec.match(/await expect\(page\)\.toHaveTitle\('Swag Labs'\);/g)).toHaveLength(3);
    expect(r.spec).toContain('await expect(page).toHaveURL(/\\/inventory/);');
    expect(r.spec).toContain("await expect(page.locator('#t')).not.toContainText('Products');");
    expect(r.spec).toContain("await expect(page.locator('#e')).toBeHidden();");
    expect(r.spec).toContain("await expect(page.locator('#b')).toBeEnabled();");
    expect(r.spec).toContain("await expect(page.locator('#i')).not.toHaveValue('x');");
    expect(r.spec).toContain("await expect(page.locator('.row')).toHaveCount(6);");
    expect(r.spec).toContain("await expect(page.locator('#c')).not.toBeChecked();");
    expect(r.flags).toEqual(['INFO CORE_ASSERT_MESSAGE_DROPPED 10']);
    expect(r.counts.sourceAssertions).toBe(10);
    expect(r.counts.outputExpects).toBe(10);
  });

  it('blocks assertions it does not support and counts them', async () => {
    const r = await convert(
      wrap(
        'assertThat(driver.getTitle(), is("Swag Labs"));',
        'assertEquals("swag labs", driver.getTitle().toLowerCase());',
        'assertNull(driver.findElement(By.id("a")).getText());',
      ),
    );
    expect(r.flags).toEqual([
      'BLOCK CORE_UNSUPPORTED_ASSERTION 5',
      'BLOCK CORE_UNSUPPORTED_ASSERTION 6',
      'BLOCK CORE_UNSUPPORTED_ASSERTION 7',
    ]);
    expect(r.counts.sourceAssertions).toBe(3);
    expect(r.counts.blockedAssertions).toBe(3);
    expect(r.tests).toEqual(['T > t: blocked']);
  });

  it('maps expected-condition waits and removes the wait object', async () => {
    const r = await convert(
      wrap(
        'WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));',
        'wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("a")));',
        'wait.until(ExpectedConditions.invisibilityOfElementLocated(By.id("b")));',
        'wait.until(ExpectedConditions.not(ExpectedConditions.urlContains("/cart")));',
        'wait.until(titleIs("Swag Labs"));',
        'wait.until(ExpectedConditions.textToBePresentInElementLocated(By.id("c"), "Done"));',
      ),
    );
    expect(r.spec).toContain("await expect(page.locator('#a')).toBeVisible();");
    expect(r.spec).toContain("await expect(page.locator('#b')).toBeHidden();");
    expect(r.spec).toContain('await expect(page).not.toHaveURL(/\\/cart/);');
    expect(r.spec).toContain("await expect(page).toHaveTitle('Swag Labs');");
    expect(r.spec).toContain("await expect(page.locator('#c')).toContainText('Done');");
    expect(r.flags).toEqual(['INFO CORE_WAIT_OBJECT 5']);
  });

  it('removes a clickable wait only before an action on the same element', async () => {
    const r = await convert(
      wrap(
        'new WebDriverWait(driver, Duration.ofSeconds(5)).until(ExpectedConditions.elementToBeClickable(By.id("a")));',
        'driver.findElement(By.id("a")).click();',
        'new WebDriverWait(driver, Duration.ofSeconds(5)).until(ExpectedConditions.elementToBeClickable(By.id("b")));',
        'driver.findElement(By.id("c")).click();',
        'new WebDriverWait(driver, Duration.ofSeconds(5)).until(ExpectedConditions.elementToBeClickable(By.id("d"))).click();',
      ),
    );
    expect(r.flags).toEqual([
      'INFO CORE_CLICKABLE_WAIT_REMOVED 5',
      'BLOCK CORE_CUSTOM_WAIT 7',
      'INFO CORE_CLICKABLE_WAIT_REMOVED 9',
    ]);
    expect(r.spec).toContain("await page.locator('#d').click();");
  });

  it('blocks lambda waits, alerts, windows, frames and the JavaScript executor', async () => {
    const r = await convert(
      wrap(
        'new WebDriverWait(driver, Duration.ofSeconds(5)).until(d -> d.getTitle().equals("x"));',
        'new WebDriverWait(driver, Duration.ofSeconds(5)).until(ExpectedConditions.alertIsPresent());',
        'driver.switchTo().window("w");',
        'driver.switchTo().frame("f");',
        'driver.findElement(By.id("a")).click();',
        'driver.switchTo().defaultContent();',
        '((JavascriptExecutor) driver).executeScript("return 1");',
        'driver.findElement(By.id("z")).click();',
      ),
    );
    expect(r.flags).toEqual([
      'BLOCK CORE_CUSTOM_WAIT 5',
      'BLOCK CORE_WINDOW 6',
      'BLOCK CORE_WINDOW 7',
      'BLOCK CORE_FRAME 8',
      'BLOCK CORE_FRAME 9',
      'BLOCK CORE_FRAME 10',
      'BLOCK CORE_JS_EXECUTOR 11',
    ]);
    expect(r.spec).toContain("await page.locator('#z').click();");
    expect(r.tests).toEqual(['T > t: blocked']);
  });

  it('keeps Thread.sleep as a fixed wait with a WARN flag', async () => {
    const r = await convert(wrap('Thread.sleep(1500L);'));
    expect(r.spec).toContain('await page.waitForTimeout(1500);');
    expect(r.flags).toEqual(['WARN CORE_FIXED_WAIT 5']);
  });

  it('removes stored elements, implicit waits and window size calls with INFO flags', async () => {
    const r = await convert(
      wrap(
        'driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(5));',
        'driver.manage().window().maximize();',
        'List<WebElement> items = driver.findElements(By.cssSelector(".item"));',
        'items.get(0).click();',
        'items.get(items.size() - 1).click();',
        'WebElement error = new WebDriverWait(driver, Duration.ofSeconds(5))',
        '        .until(ExpectedConditions.visibilityOfElementLocated(By.id("e")));',
        'assertEquals("Oops", error.getText());',
      ),
    );
    expect(r.spec).toContain("await page.locator('.item').nth(0).click();");
    expect(r.spec).toContain("await page.locator('.item').last().click();");
    expect(r.spec).toContain("await expect(page.locator('#e')).toBeVisible();");
    expect(r.spec).toContain("await expect(page.locator('#e')).toHaveText('Oops');");
    expect(r.flags).toEqual([
      'INFO CORE_IMPLICIT_WAIT 5',
      'INFO CORE_WINDOW_SIZE 6',
      'INFO CORE_STORED_ELEMENT 7',
      'INFO CORE_STORED_ELEMENT 10',
    ]);
  });

  it('reads escaped strings and blocks text blocks', async () => {
    const r = await convert(
      wrap(
        'driver.findElement(By.id("a")).sendKeys("C:\\\\new");',
        'driver.findElement(By.id("b")).sendKeys("say \\"hi\\"");',
        'driver.findElement(By.id("c")).sendKeys("""',
        '        x""");',
      ),
    );
    expect(r.spec).toContain("await page.locator('#a').fill('C:\\\\new');");
    expect(r.spec).toContain("await page.locator('#b').fill('say \"hi\"');");
    expect(r.flags).toContain('BLOCK CORE_UNKNOWN_STATEMENT 7');
  });

  it('converts JUnit 5 and TestNG skips and reads DisplayName', async () => {
    const text = [
      'public class SkipTest {',
      '    @Test',
      '    @Disabled("later")',
      '    void a() {}',
      '',
      '    @Test(enabled = false)',
      '    public void b() {}',
      '',
      '    @Test',
      '    @DisplayName("shows the title")',
      '    void c() {}',
      '}',
      '',
      '@Disabled',
      'class SkippedTest {',
      '    @Test',
      '    void d() {}',
      '}',
      '',
    ].join('\n');
    const r = await convert(text);
    expect(r.spec).toContain("test.skip('a', async () => {});");
    expect(r.spec).toContain("test.skip('b', async () => {});");
    expect(r.spec).toContain("test('shows the title', async () => {});");
    expect(r.spec).toContain("test.describe.skip('SkippedTest', () => {");
    expect(r.counts.tests).toBe(4);
  });

  it('lists and counts dropped tests, members and classes', async () => {
    const text = [
      'class HelperPage {',
      '    void open() { assertTrue(true); }',
      '}',
      '',
      'class DropTest {',
      '    private WebDriver driver;',
      '    private String base = "https://www.saucedemo.com/";',
      '',
      '    @BeforeAll',
      '    static void start() {}',
      '',
      '    void helper() { assertTrue(true); }',
      '',
      '    @Nested',
      '    class Inner {',
      '        @Test',
      '        void inner() { assertTrue(true); }',
      '    }',
      '',
      '    @Test(dataProvider = "users")',
      '    void param() { assertTrue(true); }',
      '',
      '    @Test',
      '    void kept() {',
      '        driver.get("https://www.saucedemo.com/");',
      '    }',
      '}',
      '',
    ].join('\n');
    const r = await convert(text);
    expect(r.flags).toEqual([
      'BLOCK CORE_UNKNOWN_STATEMENT 1',
      'BLOCK CORE_UNSUPPORTED_MEMBER 7',
      'BLOCK CORE_UNSUPPORTED_MEMBER 9',
      'BLOCK CORE_UNSUPPORTED_MEMBER 12',
      'BLOCK CORE_UNSUPPORTED_MEMBER 14',
      'BLOCK CORE_UNKNOWN_STATEMENT 20',
    ]);
    expect(r.tests).toEqual([
      'DropTest > Inner > inner: blocked',
      'DropTest > param: blocked',
      'DropTest > kept: blocked',
    ]);
    expect(r.spec).toContain("test.fixme('kept'");
    expect(r.spec).not.toMatch(/^\s*test\('/m);
    expect(r.counts.tests).toBe(3);
    expect(r.counts.sourceAssertions).toBe(4);
    expect(r.counts.blockedAssertions).toBe(4);
    expect(r.file.sourceTests).toBe(3);
    expect(r.spec).toContain('Class member start() is not converted.');
    expect(r.spec).toContain('Class member class Inner is not converted.');
    expect(r.status).toBe('blocked');
  });

  it('blocks a test method that takes a parameter', async () => {
    const r = await convert('class T {\n    @Test\n    void t(TestInfo info) {}\n}\n');
    expect(r.flags).toEqual(['BLOCK CORE_UNKNOWN_STATEMENT 2']);
    expect(r.tests).toEqual(['T > t: blocked']);
  });
});

describe('selenium-java fully qualified Selenium types', () => {
  const hookClass = (setUp: string): string =>
    [
      'class T {',
      '    private org.openqa.selenium.WebDriver driver;',
      '    private org.openqa.selenium.support.ui.WebDriverWait wait;',
      '    @BeforeEach',
      '    void setUp() {',
      `        ${setUp}`,
      '        wait = new org.openqa.selenium.support.ui.WebDriverWait(driver, Duration.ofSeconds(5));',
      '    }',
      '    @Test',
      '    void t() {',
      '        driver.get("https://www.saucedemo.com/");',
      '    }',
      '}',
      '',
    ].join('\n');

  it.each([
    'driver = new org.openqa.selenium.chrome.ChromeDriver();',
    'driver = new org.openqa.selenium.firefox.FirefoxDriver();',
    'driver = new org.openqa.selenium.edge.EdgeDriver();',
  ])('removes %s in @BeforeEach without a BLOCK flag', async (setUp) => {
    const r = await convert(hookClass(setUp));
    expect(r.status).toBe('converted');
    expect(r.counts.block).toBe(0);
    expect(r.flags).toEqual(['INFO CORE_DRIVER_LIFECYCLE 6', 'INFO CORE_WAIT_OBJECT 7']);
    expect(r.spec).toContain("await page.goto('https://www.saucedemo.com/');");
  });

  it('does not treat a driver class from another package as a Selenium driver', async () => {
    const r = await convert(hookClass('driver = new com.example.ChromeDriver();'));
    expect(r.status).toBe('blocked');
    expect(r.flags).toContain('BLOCK CORE_UNKNOWN_STATEMENT 6');
  });

  it('converts the fully qualified fixture like the login-success case', async () => {
    const source = 'tests/fixtures/selenium-java/QualifiedDriverTest.java';
    const text = readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
    const result = await convertSource(
      'selenium-java',
      'selenium-java/LoginSuccessTest.java',
      text,
      null,
    );
    const caseDir = 'fixtures/saucedemo/cases/login-success/expected';
    expect(result.spec).toBe(readFileSync(`${caseDir}/selenium-java.spec.ts`, 'utf8'));
    const golden = toGoldenReport(result.report);
    const expected = JSON.parse(readFileSync(`${caseDir}/selenium-java.report.json`, 'utf8')) as {
      flags: Array<{ ruleId: string }>;
      counts: unknown;
      tests: unknown;
    };
    expect(golden.status).toBe('converted');
    expect(golden.counts).toEqual(expected.counts);
    expect(golden.tests).toEqual(expected.tests);
    expect(golden.flags.map((f) => f.ruleId)).toEqual(expected.flags.map((f) => f.ruleId));
  });
});
