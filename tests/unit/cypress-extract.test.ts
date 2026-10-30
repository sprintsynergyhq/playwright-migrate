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

  it('flags unknown top-level statements and it.only at file level', async () => {
    const r = await convert(
      [
        "const user = 'standard_user';",
        "describe('S', () => {",
        "  it.only('t', () => {",
        "    cy.get('#a').should('be.visible');",
        '  });',
        '});',
        '',
      ].join('\n'),
    );
    expect(r.flags).toEqual(['BLOCK CORE_UNKNOWN_STATEMENT 1', 'BLOCK CORE_UNKNOWN_STATEMENT 3']);
    expect(r.status).toBe('blocked');
  });

  it('converts it.skip to test.skip', async () => {
    const r = await convert(
      [
        "describe('S', () => {",
        "  it.skip('t', () => {",
        '    cy.reload();',
        '  });',
        '});',
        '',
      ].join('\n'),
    );
    expect(r.spec).toContain("test.skip('t', async ({ page }) => {");
  });
});
