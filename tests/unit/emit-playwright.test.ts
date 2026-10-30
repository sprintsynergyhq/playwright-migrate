import { describe, expect, it } from 'vitest';
import type { Locator, MigrationFile, SourceSpan, Step, SuiteItem } from '../../src/core/ir.js';
import {
  containsRegex,
  emitPlaywright,
  emitPlaywrightRaw,
  locatorExpr,
  stepLines,
} from '../../src/emit/playwright.js';
import {
  action,
  blocked,
  css,
  expectStep,
  fill,
  fixedWait,
  flag,
  goto,
  hook,
  removed,
  suite,
  test,
} from '../ir-fixtures/helpers.js';

const URL = 'https://www.saucedemo.com/';

// Builds a span. Text defaults to a placeholder because only blocked steps print it.
const at = (
  startLine: number,
  text = 'source',
  endLine = startLine,
  startColumn = 4,
): SourceSpan => ({
  startLine,
  endLine,
  startColumn,
  text,
});

const file = (
  sourcePath: string,
  framework: MigrationFile['framework'],
  items: SuiteItem[],
): MigrationFile => ({
  sourcePath,
  framework,
  items,
  fileFlags: [],
  sourceAssertions: 0,
  sourceStatements: 0,
});

// The login steps shared by the WARN and BLOCK samples below.
const login = (first: number): Step[] => [
  fill(at(first), css('[data-test="username"]'), 'standard_user'),
  fill(at(first + 1), css('[data-test="password"]'), 'secret_sauce'),
  action(at(first + 2), 'click', css('[data-test="login-button"]')),
];

const code = (step: Step): string[] => {
  const { comments, code: lines } = stepLines(step);
  return [...comments, ...lines];
};

describe('locator expressions', () => {
  const loc = (l: Partial<Locator>): Locator => ({ strategy: 'css', value: '.x', chain: [], ...l });

  it('maps every strategy', () => {
    expect(locatorExpr(loc({}))).toBe('page.locator(".x")');
    expect(locatorExpr(loc({ strategy: 'xpath', value: '//div[@id="a"]' }))).toBe(
      'page.locator("xpath=//div[@id=\\"a\\"]")',
    );
    expect(locatorExpr(loc({ strategy: 'text', value: 'Products' }))).toBe(
      'page.getByText("Products")',
    );
    expect(
      locatorExpr(loc({ strategy: 'text', value: 'Products', options: { exact: true } })),
    ).toBe('page.getByText("Products", { exact: true })');
    expect(
      locatorExpr(
        loc({ strategy: 'role', value: 'link', options: { name: 'About', exact: true } }),
      ),
    ).toBe('page.getByRole("link", { name: "About", exact: true })');
  });

  it('maps chains', () => {
    const chained = loc({
      value: '.inventory_item',
      chain: [
        { kind: 'nth', index: 2 },
        { kind: 'locator', strategy: 'css', value: 'button' },
        { kind: 'first' },
        { kind: 'last' },
        { kind: 'hasText', text: 'Remove' },
      ],
    });
    expect(locatorExpr(chained)).toBe(
      'page.locator(".inventory_item").nth(2).locator("button").first().last().filter({ hasText: "Remove" })',
    );
  });
});

describe('step lines', () => {
  it('maps navigation', () => {
    expect(code(goto(at(1), URL))).toEqual([`await page.goto("${URL}");`]);
  });

  it('maps select options', () => {
    const sel = css('.product_sort_container');
    expect(
      code(action(at(1), 'selectOption', sel, { select: { by: 'valueOrLabel', value: 'lohi' } })),
    ).toEqual(['await page.locator(".product_sort_container").selectOption("lohi");']);
    expect(
      code(action(at(1), 'selectOption', sel, { select: { by: 'value', value: 'lohi' } })),
    ).toEqual(['await page.locator(".product_sort_container").selectOption({ value: "lohi" });']);
    expect(
      code(
        action(at(1), 'selectOption', sel, {
          select: { by: 'label', value: 'Price (low to high)' },
        }),
      ),
    ).toEqual([
      'await page.locator(".product_sort_container").selectOption({ label: "Price (low to high)" });',
    ]);
    expect(code(action(at(1), 'selectOption', sel, { select: { by: 'index', index: 2 } }))).toEqual(
      ['await page.locator(".product_sort_container").selectOption({ index: 2 });'],
    );
  });

  it('maps assertions', () => {
    const badge = css('.shopping_cart_badge');
    expect(code(expectStep(at(1), 'count', badge, { expected: 0 }))).toEqual([
      'await expect(page.locator(".shopping_cart_badge")).toHaveCount(0);',
    ]);
    expect(code(expectStep(at(1), 'attached', badge, { negated: true }))).toEqual([
      'await expect(page.locator(".shopping_cart_badge")).not.toBeAttached();',
    ]);
    expect(
      code(expectStep(at(1), 'attribute', badge, { attribute: 'class', expected: 'a' })),
    ).toEqual([
      'await expect(page.locator(".shopping_cart_badge")).toHaveAttribute("class", "a");',
    ]);
    expect(
      code(expectStep(at(1), 'containClass', badge, { expected: 'shopping_cart_badge' })),
    ).toEqual([
      'await expect(page.locator(".shopping_cart_badge")).toContainClass("shopping_cart_badge");',
    ]);
    expect(code(expectStep(at(1), 'title', 'page', { expected: 'Swag Labs' }))).toEqual([
      'await expect(page).toHaveTitle("Swag Labs");',
    ]);
    expect(code(expectStep(at(1), 'titleContains', 'page', { expected: 'Swag' }))).toEqual([
      'await expect(page).toHaveTitle(/Swag/);',
    ]);
  });

  it('escapes regex specials and slashes for contains checks', () => {
    expect(containsRegex('/inventory.html')).toBe('/\\/inventory\\.html/');
    expect(containsRegex('a+b(c)?[d]')).toBe('/a\\+b\\(c\\)\\?\\[d\\]/');
  });

  it('emits nothing for a removed step', () => {
    expect(code(removed(at(1), 'driver-lifecycle', 'CORE_DRIVER_LIFECYCLE'))).toEqual([]);
  });

  it('prints a fixed wait with its WARN comment', () => {
    expect(code(fixedWait(at(7), 500))).toEqual([
      '// playwright-migrate WARN CORE_FIXED_WAIT: Fixed wait kept. Replace it with a web-first assertion on the condition the test needs.',
      'await page.waitForTimeout(500);',
    ]);
  });
});

describe('emitted files', () => {
  it('keeps a fixed wait with a WARN comment (cy-wait-time)', async () => {
    const f = file('cypress-js/wait-time.cy.js', 'cypress-js', [
      suite('Fixed Wait', at(1), [
        test('waits a fixed time before checking the title', at(2), [
          goto(at(3), URL),
          ...login(4),
          fixedWait(at(7), 500),
          expectStep(at(8), 'text', css('[data-test="title"]'), { expected: 'Products' }),
        ]),
      ]),
    ]);
    expect(await emitPlaywright(f)).toBe(`// Migrated from: cypress-js/wait-time.cy.js
import { test, expect } from '@playwright/test';

test.describe('Fixed Wait', () => {
  test('waits a fixed time before checking the title', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('[data-test="username"]').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
    // playwright-migrate WARN CORE_FIXED_WAIT: Fixed wait kept. Replace it with a web-first assertion on the condition the test needs.
    await page.waitForTimeout(500);
    await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  });
});
`);
  });

  it('turns a test with BLOCK steps into test.fixme with the source lines (cy-intercept)', async () => {
    const f = file('cypress-js/intercept.cy.js', 'cypress-js', [
      suite('Network Stub', at(1), [
        test('waits for an intercepted request', at(2), [
          blocked(
            at(3, "cy.intercept('GET', '**/inventory.html').as('inventory');"),
            'CY_INTERCEPT',
          ),
          goto(at(4), URL),
          ...login(5),
          blocked(at(8, "cy.wait('@inventory');"), 'CY_ALIAS'),
          expectStep(at(9), 'text', css('[data-test="title"]'), { expected: 'Products' }),
        ]),
      ]),
    ]);
    expect(await emitPlaywright(f)).toBe(`// Migrated from: cypress-js/intercept.cy.js
import { test, expect } from '@playwright/test';

test.describe('Network Stub', () => {
  test.fixme('waits for an intercepted request', async ({ page }) => {
    // playwright-migrate BLOCK CY_INTERCEPT: cy.intercept is not converted. Rewrite it with page.route or page.waitForResponse, registered before the action that sends the request.
    // Source line 3: cy.intercept('GET', '**/inventory.html').as('inventory');
    await page.goto('https://www.saucedemo.com/');
    await page.locator('[data-test="username"]').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
    // playwright-migrate BLOCK CY_ALIAS: Cypress aliases (.as and cy.wait('@alias')) are not converted. Keep a variable or a page.waitForResponse promise instead.
    // Source line 8: cy.wait('@inventory');
    await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  });
});
`);
  });

  it('prints multi-line sources and imports only test when no expect is left (cy-then)', async () => {
    const source = [
      `cy.get('[data-test="title"]').then(($title) => {`,
      `      expect($title.text()).to.equal('Products');`,
      `    });`,
    ].join('\n');
    const f = file('cypress-js/then-callback.cy.js', 'cypress-js', [
      suite('Then Callback', at(1), [
        test('reads the title in a then callback', at(2), [
          goto(at(3), URL),
          ...login(4),
          blocked(at(7, source, 9, 4), 'CY_THEN', undefined, 1),
        ]),
      ]),
    ]);
    expect(await emitPlaywright(f)).toBe(`// Migrated from: cypress-js/then-callback.cy.js
import { test } from '@playwright/test';

test.describe('Then Callback', () => {
  test.fixme('reads the title in a then callback', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('[data-test="username"]').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
    // playwright-migrate BLOCK CY_THEN: Callbacks (.then, .each, .spread, should with a function) are not converted. Rewrite the callback with locators and expect.
    // Source lines 7-9:
    //   cy.get('[data-test="title"]').then(($title) => {
    //     expect($title.text()).to.equal('Products');
    //   });
  });
});
`);
  });

  it('dedents continuation lines by the start column (java-custom-wait)', async () => {
    const source = [
      'new WebDriverWait(driver, Duration.ofSeconds(10))',
      '                .until(d -> d.findElement(By.className("title")).getText().equals("Products"));',
    ].join('\n');
    const f = file('selenium-java/CustomWaitTest.java', 'selenium-java', [
      suite('CustomWaitTest', at(13), [
        hook('beforeEach', at(16), [removed(at(18), 'driver-lifecycle', 'CORE_DRIVER_LIFECYCLE')]),
        hook('afterEach', at(21), [removed(at(23), 'driver-lifecycle', 'CORE_DRIVER_LIFECYCLE')]),
        test('waitsWithALambda', at(26), [
          goto(at(28), URL),
          fill(at(29), css('#user-name'), 'standard_user'),
          fill(at(30), css('#password'), 'secret_sauce'),
          action(at(31), 'click', css('#login-button')),
          blocked(at(32, source, 33, 8), 'CORE_CUSTOM_WAIT'),
        ]),
      ]),
    ]);
    expect(await emitPlaywright(f)).toBe(`// Migrated from: selenium-java/CustomWaitTest.java
import { test } from '@playwright/test';

test.describe('CustomWaitTest', () => {
  test.fixme('waitsWithALambda', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
    // playwright-migrate BLOCK CORE_CUSTOM_WAIT: Wait with a custom condition is not converted. Rewrite it as a web-first assertion.
    // Source lines 32-33:
    //   new WebDriverWait(driver, Duration.ofSeconds(10))
    //           .until(d -> d.findElement(By.className("title")).getText().equals("Products"));
  });
});
`);
  });

  it('emits a top-level fixme test with one comment per blocked line (py-switch-frame)', async () => {
    const f = file('selenium-python/test_switch_frame.py', 'selenium-python', [
      test('test_clicks_button_in_frame', at(13, 'def', 18, 0), [
        goto(at(14), URL),
        blocked(at(15, 'driver.switch_to.frame("payment-frame")'), 'CORE_FRAME'),
        blocked(at(16, 'driver.find_element(By.ID, "pay").click()'), 'CORE_FRAME'),
        blocked(at(17, 'driver.switch_to.default_content()'), 'CORE_FRAME'),
        expectStep(at(18), 'urlContains', 'page', { expected: 'saucedemo' }),
      ]),
    ]);
    f.fileFlags.push(flag('CORE_DRIVER_LIFECYCLE', 6));
    expect(await emitPlaywright(f)).toBe(`// Migrated from: selenium-python/test_switch_frame.py
import { test, expect } from '@playwright/test';

test.fixme('test_clicks_button_in_frame', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');
  // playwright-migrate BLOCK CORE_FRAME: Frame switching is not converted. Use page.frameLocator for the steps inside the frame.
  // Source line 15: driver.switch_to.frame("payment-frame")
  // playwright-migrate BLOCK CORE_FRAME: Frame switching is not converted. Use page.frameLocator for the steps inside the frame.
  // Source line 16: driver.find_element(By.ID, "pay").click()
  // playwright-migrate BLOCK CORE_FRAME: Frame switching is not converted. Use page.frameLocator for the steps inside the frame.
  // Source line 17: driver.switch_to.default_content()
  await expect(page).toHaveURL(/saucedemo/);
});
`);
  });

  it('uses async () => when a test has no statements, and skips removed-only hooks', () => {
    const f = file('cypress-js/only-blocked.cy.js', 'cypress-js', [
      hook('afterEach', at(1), [removed(at(2), 'driver-lifecycle', 'CORE_DRIVER_LIFECYCLE')]),
      test('custom', at(4), [
        blocked(at(5, 'cy.login();'), 'CY_CUSTOM_COMMAND', { name: 'login' }),
      ]),
    ]);
    const raw = emitPlaywrightRaw(f);
    expect(raw).toContain('test.fixme("custom", async () => {');
    expect(raw).not.toContain('afterEach');
    expect(raw).toContain("import { test } from '@playwright/test';");
  });

  it('keeps skipped tests and suites skipped', () => {
    const f = file('cypress-js/skip.cy.js', 'cypress-js', [
      suite('S', at(1), [test('t', at(2), [goto(at(3), URL)], true)], true),
    ]);
    const raw = emitPlaywrightRaw(f);
    expect(raw).toContain('test.describe.skip("S", () => {');
    expect(raw).toContain('test.skip("t", async ({ page }) => {');
  });

  it('prints WARN and BLOCK file flags under the import, but not INFO', () => {
    const f = file('selenium-java/Fields.java', 'selenium-java', [
      test('t', at(5), [goto(at(6), URL)]),
    ]);
    f.fileFlags.push(
      flag('CORE_UNSUPPORTED_MEMBER', 3, { detail: 'helper()' }),
      flag('CORE_DRIVER_LIFECYCLE', 2),
    );
    const lines = emitPlaywrightRaw(f).split('\n');
    expect(lines.slice(0, 5)).toEqual([
      '// Migrated from: selenium-java/Fields.java',
      "import { test } from '@playwright/test';",
      '',
      '// playwright-migrate BLOCK CORE_UNSUPPORTED_MEMBER: Class member helper() is not converted. Move shared setup into a hook or a fixture by hand.',
      '',
    ]);
  });

  it('is deterministic', async () => {
    const f = file('cypress-js/a.cy.js', 'cypress-js', [test('t', at(1), [goto(at(2), URL)])]);
    expect(await emitPlaywright(f)).toBe(await emitPlaywright(f));
  });
});
