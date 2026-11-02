import { describe, expect, it } from 'vitest';
import { convertSource } from '../../src/core/convert.js';
import { toGoldenReport } from '../../src/core/report.js';

// Wraps body lines in describe and it. The first body line is source line 3.
const wrap = (...body: string[]): string =>
  [
    "describe('S', () => {",
    "  it('t', () => {",
    ...body.map((l) => `    ${l}`),
    '  });',
    '});',
    '',
  ].join('\n');

async function convert(text: string) {
  const result = await convertSource('cypress-js', 't.cy.js', text, null);
  const golden = toGoldenReport(result.report);
  return {
    spec: result.spec,
    status: golden.status,
    counts: golden.counts,
    flags: golden.flags.map((f) => `${f.level} ${f.ruleId} ${f.line}`),
    tests: golden.tests.map((x) => `${x.title}: ${x.status}`),
  };
}

describe('cypress-js extractor', () => {
  it('maps navigation commands', async () => {
    const r = await convert(
      wrap(
        "cy.visit('https://www.saucedemo.com/');",
        'cy.reload();',
        "cy.go('back');",
        'cy.go(1);',
      ),
    );
    expect(r.spec).toContain("await page.goto('https://www.saucedemo.com/');");
    expect(r.spec).toContain('await page.reload();');
    expect(r.spec).toContain('await page.goBack();');
    expect(r.spec).toContain('await page.goForward();');
    expect(r.status).toBe('converted');
  });

  it('maps actions and adds the fill INFO flag for type', async () => {
    const r = await convert(
      wrap(
        "cy.get('#a').type('x');",
        "cy.get('#b').click();",
        "cy.get('#c').check();",
        "cy.get('#d').select('lohi');",
      ),
    );
    expect(r.spec).toContain("await page.locator('#a').fill('x');");
    expect(r.spec).toContain("await page.locator('#c').check();");
    expect(r.spec).toContain("await page.locator('#d').selectOption('lohi');");
    expect(r.flags).toEqual(['INFO CORE_FILL_REPLACES_VALUE 3']);
  });

  it('maps negated assertions and url assertions', async () => {
    const r = await convert(
      wrap(
        "cy.get('#a').should('not.be.visible');",
        "cy.get('#b').should('have.length', 3);",
        "cy.url().should('include', '/inventory.html');",
      ),
    );
    expect(r.spec).toContain("await expect(page.locator('#a')).not.toBeVisible();");
    expect(r.spec).toContain("await expect(page.locator('#b')).toHaveCount(3);");
    expect(r.counts.sourceAssertions).toBe(3);
    expect(r.counts.outputExpects).toBe(3);
  });

  it('keeps a fixed wait with a WARN flag', async () => {
    const r = await convert(wrap('cy.wait(250);'));
    expect(r.spec).toContain('await page.waitForTimeout(250);');
    expect(r.status).toBe('converted_with_warnings');
    expect(r.flags).toEqual(['WARN CORE_FIXED_WAIT 3']);
  });

  it('blocks a custom command and an unsupported built-in command', async () => {
    const r = await convert(wrap("cy.login('a', 'b');", "cy.get('#a').trigger('mouseover');"));
    expect(r.flags).toEqual(['BLOCK CY_CUSTOM_COMMAND 3', 'BLOCK CY_UNSUPPORTED_COMMAND 4']);
    expect(r.spec).toContain("test.fixme('t'");
    expect(r.spec).toContain("// Source line 4: cy.get('#a').trigger('mouseover');");
  });

  it('blocks type with a special key sequence', async () => {
    const r = await convert(wrap("cy.get('#a').type('x{enter}');"));
    expect(r.flags).toEqual(['BLOCK CY_UNSUPPORTED_COMMAND 3']);
  });

  it('blocks an unsupported assertion and counts it as blocked', async () => {
    const r = await convert(wrap("cy.get('#a').should('have.css', 'color', 'red');"));
    expect(r.flags).toEqual(['BLOCK CORE_UNSUPPORTED_ASSERTION 3']);
    expect(r.counts.blockedAssertions).toBe(1);
    expect(r.counts.outputExpects).toBe(0);
  });

  it('blocks alias use in get and wait', async () => {
    const r = await convert(wrap("cy.get('@row').click();", "cy.wait('@req');"));
    expect(r.flags).toEqual(['BLOCK CY_ALIAS 3', 'BLOCK CY_ALIAS 4']);
  });

  it('marks cy.contains as a text locator', async () => {
    const r = await convert(wrap("cy.contains('Products').should('be.visible');"));
    expect(r.spec).toContain("await expect(page.getByText('Products')).toBeVisible();");
    expect(r.flags).toEqual(['INFO CORE_TEXT_LOCATOR 3']);
  });

  it('converts beforeEach and blocks every statement in before', async () => {
    const r = await convert(
      [
        "describe('S', () => {",
        '  before(() => {',
        "    cy.visit('https://www.saucedemo.com/');",
        '  });',
        '  beforeEach(() => {',
        "    cy.visit('https://www.saucedemo.com/');",
        '  });',
        "  it('t', () => {",
        "    cy.get('#a').should('be.visible');",
        '  });',
        '});',
        '',
      ].join('\n'),
    );
    expect(r.flags).toEqual(['BLOCK CY_BEFORE_HOOK 3']);
    expect(r.status).toBe('blocked');
    expect(r.spec).toContain('test.beforeEach(async ({ page }) => {');
  });

  it('prints a file flag with its source line and text', async () => {
    const r = await convert(
      [
        "const user = 'standard_user';",
        "describe('S', () => {",
        "  it('t', () => {",
        "    cy.visit('https://www.saucedemo.com/');",
        '  });',
        '});',
        '',
      ].join('\n'),
    );
    expect(r.flags).toEqual(['BLOCK CORE_UNKNOWN_STATEMENT 1']);
    expect(r.status).toBe('blocked');
    expect(r.spec).toContain(
      [
        '// playwright-migrate BLOCK CORE_UNKNOWN_STATEMENT: Statement not recognized, so it was not converted. Convert it by hand.',
        "// Source line 1: const user = 'standard_user';",
      ].join('\n'),
    );
    // The dropped top-level code may set up state for the test, so the test must not run.
    expect(r.tests).toEqual(['S > t: blocked']);
    expect(r.spec).toContain("test.fixme('t'");
    expect(r.spec).toContain('// playwright-migrate: code outside this test was not converted');
  });

  it('lists and counts a dropped test and its assertions', async () => {
    const r = await convert(
      [
        "describe('S', () => {",
        "  it('kept', () => {",
        "    cy.visit('https://www.saucedemo.com/');",
        '  });',
        "  it('dropped', (done) => {",
        "    cy.get('#a').should('be.visible').and('have.text', 'A');",
        '    done();',
        '  });',
        '});',
        '',
      ].join('\n'),
    );
    expect(r.flags).toEqual(['BLOCK CORE_UNKNOWN_STATEMENT 5']);
    expect(r.tests).toEqual(['S > kept: converted', 'S > dropped: blocked']);
    expect(r.counts).toMatchObject({ tests: 2, sourceAssertions: 2, blockedAssertions: 2 });
    expect(r.spec).toContain('// Source lines 5-8:');
    expect(r.spec).toContain("//   it('dropped', (done) => {");
    expect(r.spec).toContain('//     done();');
  });

  it('lists every test inside a dropped suite', async () => {
    const r = await convert(
      [
        'describe(TITLE, () => {',
        "  it('a', () => {});",
        "  describe('inner', () => {",
        "    it('b', () => {});",
        '  });',
        '});',
        '',
      ].join('\n'),
    );
    expect(r.tests).toEqual(['(untitled) > a: blocked', '(untitled) > inner > b: blocked']);
    expect(r.counts.tests).toBe(2);
  });

  it('converts it.only and describe.only to normal tests with a WARN', async () => {
    const r = await convert(
      [
        "describe.only('S', () => {",
        "  it.only('t', () => {",
        "    cy.get('#a').should('be.visible');",
        '  });',
        '});',
        '',
      ].join('\n'),
    );
    expect(r.flags).toEqual(['WARN CY_ONLY 1', 'WARN CY_ONLY 2']);
    expect(r.status).toBe('converted_with_warnings');
    expect(r.spec).not.toContain('.only(');
    expect(r.spec).toContain("test('t', async ({ page }) => {");
    expect(r.spec).toContain(
      [
        '// playwright-migrate WARN CY_ONLY: it.only was converted to a normal it, because Playwright test.only would skip every other test in the run. Add .only back by hand if you need it.',
        '// Source line 2: it.only',
      ].join('\n'),
    );
  });

  it('converts it.skip, xit, xspecify, describe.skip and xdescribe to skipped tests', async () => {
    const r = await convert(
      [
        "describe('S', () => {",
        "  it.skip('a', () => {",
        '    cy.reload();',
        '  });',
        "  xit('b', () => {",
        '    cy.reload();',
        '  });',
        "  xspecify('c', () => {",
        '    cy.reload();',
        '  });',
        '});',
        "describe.skip('T', () => {",
        "  it('d', () => {});",
        '});',
        "xdescribe('U', () => {",
        "  it('e', () => {});",
        '});',
        '',
      ].join('\n'),
    );
    expect(r.flags).toEqual([]);
    expect(r.spec).toContain("test.skip('a', async ({ page }) => {");
    expect(r.spec).toContain("test.skip('b', async ({ page }) => {");
    expect(r.spec).toContain("test.skip('c', async ({ page }) => {");
    expect(r.spec).toContain("test.describe.skip('T', () => {");
    expect(r.spec).toContain("test.describe.skip('U', () => {");
    expect(r.counts.tests).toBe(5);
  });

  it('converts expression-bodied arrow tests and hooks as one statement', async () => {
    const r = await convert(
      [
        "describe('S', () => {",
        "  beforeEach(() => cy.visit('https://www.saucedemo.com/'));",
        "  it('t', () => cy.get('[data-test=\"title\"]').should('have.text', 'Products'));",
        '});',
        '',
      ].join('\n'),
    );
    expect(r.flags).toEqual([]);
    expect(r.status).toBe('converted');
    expect(r.counts).toMatchObject({ tests: 1, sourceAssertions: 1, outputExpects: 1 });
    expect(r.spec).toContain("await page.goto('https://www.saucedemo.com/');");
    expect(r.spec).toContain(
      "await expect(page.locator('[data-test=\"title\"]')).toHaveText('Products');",
    );
  });
});

describe('cypress-js extractor chains and callbacks', () => {
  it('maps find, first, last and eq', async () => {
    const r = await convert(
      wrap(
        "cy.get('.a').find('.b').first().click();",
        "cy.get('.a').eq(2).click();",
        "cy.get('.a').eq(-1).click();",
        "cy.get('.a').last().click();",
      ),
    );
    expect(r.spec).toContain("await page.locator('.a').locator('.b').first().click();");
    expect(r.spec).toContain("await page.locator('.a').nth(2).click();");
    expect(r.spec.match(/await page\.locator\('\.a'\)\.last\(\)\.click\(\);/g)).toHaveLength(2);
    expect(r.status).toBe('converted');
  });

  it('maps cy.contains with a selector and contains on an element', async () => {
    const r = await convert(
      wrap(
        "cy.contains('.btn', 'Add').click();",
        "cy.get('.list').contains('Backpack').should('be.visible');",
      ),
    );
    expect(r.spec).toContain("await page.locator('.btn').filter({ hasText: 'Add' }).click();");
    expect(r.spec).toContain(
      "await expect(page.locator('.list').getByText('Backpack')).toBeVisible();",
    );
    expect(r.flags).toEqual(['INFO CORE_TEXT_LOCATOR 3', 'INFO CORE_TEXT_LOCATOR 4']);
  });

  it('maps the element assertion table', async () => {
    const r = await convert(
      wrap(
        "cy.get('.a').should('have.attr', 'href', '/x');",
        "cy.get('.a').should('have.attr', 'disabled');",
        "cy.get('.a').should('have.class', 'primary');",
        "cy.get('#c').should('be.checked').and('not.be.disabled');",
        "cy.get('#e').should('be.enabled');",
        "cy.get('#h').should('be.hidden');",
        "cy.title().should('include', 'Swag');",
      ),
    );
    expect(r.spec).toContain("await expect(page.locator('.a')).toHaveAttribute('href', '/x');");
    expect(r.spec).toContain("await expect(page.locator('.a')).toHaveAttribute('disabled');");
    expect(r.spec).toContain("await expect(page.locator('.a')).toContainClass('primary');");
    expect(r.spec).toContain("await expect(page.locator('#c')).toBeChecked();");
    expect(r.spec).toContain("await expect(page.locator('#c')).not.toBeDisabled();");
    expect(r.spec).toContain("await expect(page.locator('#e')).toBeEnabled();");
    expect(r.spec).toContain("await expect(page.locator('#h')).toBeHidden();");
    expect(r.spec).toContain('await expect(page).toHaveTitle(/Swag/);');
    expect(r.counts.sourceAssertions).toBe(8);
    expect(r.counts.outputExpects).toBe(8);
  });

  it('inlines within into the locator chain with an INFO flag at the within line', async () => {
    const r = await convert(
      wrap(
        "cy.get('.row')",
        '  .last()',
        '  .within(() => {',
        "    cy.get('button').click();",
        "    cy.contains('Remove').should('be.visible');",
        '  });',
      ),
    );
    expect(r.spec).toContain("await page.locator('.row').last().locator('button').click();");
    expect(r.spec).toContain(
      "await expect(page.locator('.row').last().getByText('Remove')).toBeVisible();",
    );
    expect(r.flags).toEqual(['INFO CY_WITHIN 5', 'INFO CORE_TEXT_LOCATOR 7']);
    expect(r.status).toBe('converted');
  });

  it('blocks the whole statement when a within step cannot be converted', async () => {
    const r = await convert(
      wrap("cy.get('.row').within(() => {", "  cy.get('a').rightclick();", '});'),
    );
    expect(r.flags).toEqual(['BLOCK CY_UNSUPPORTED_COMMAND 3']);
    expect(r.spec).toContain('// Source lines 3-5:');
  });

  it('blocks within that is not the last call in the chain', async () => {
    const r = await convert(wrap("cy.get('.row').within(() => { cy.get('a').click(); }).click();"));
    expect(r.flags).toEqual(['BLOCK CY_UNSUPPORTED_COMMAND 3']);
  });

  it('blocks intercept, as and alias waits', async () => {
    const r = await convert(
      wrap("cy.intercept('GET', '/api').as('api');", "cy.get('.a').as('row');", "cy.wait('@api');"),
    );
    expect(r.flags).toEqual(['BLOCK CY_INTERCEPT 3', 'BLOCK CY_ALIAS 4', 'BLOCK CY_ALIAS 5']);
  });

  it('blocks then, each and should with a function, and counts their assertions', async () => {
    const r = await convert(
      wrap(
        "cy.get('.a').then(($a) => {",
        "  expect($a.text()).to.equal('x');",
        '});',
        "cy.get('.a').each(($a) => {",
        "  cy.wrap($a).should('be.visible');",
        '});',
        "cy.get('.a').should(($a) => {",
        '  expect($a).to.have.length(2);',
        '});',
      ),
    );
    expect(r.flags).toEqual(['BLOCK CY_THEN 3', 'BLOCK CY_THEN 6', 'BLOCK CY_THEN 9']);
    expect(r.counts.sourceAssertions).toBe(4);
    expect(r.counts.blockedAssertions).toBe(4);
    expect(r.spec).toContain('// Source lines 3-5:');
  });

  it('blocks iframe access through its', async () => {
    const r = await convert(
      wrap("cy.get('iframe').its('0.contentDocument.body').find('button').click();"),
    );
    expect(r.flags).toEqual(['BLOCK CY_UNSUPPORTED_COMMAND 3']);
  });
});
