# SauceDemo Fixtures

Every case in this folder is the same test written in three source frameworks: Cypress JS, Selenium Python and Selenium Java. All fixtures target https://www.saucedemo.com only, a public practice app. Never add client code here.

## Folder Layout

```
cases/<case-id>/
  case.json                   case metadata
  cypress-js/                 Cypress JS source
  selenium-python/            Selenium Python source
  selenium-java/              Selenium Java source
  expected/<source>.spec.ts   hand-written Playwright output for that source
```

- `case.json` lists the case id, title, intent, app URL, the source file for each framework, and `expectCount` (the number of `expect(` calls in each expected spec).
- `expected/<source>.spec.ts` is the hand-written Playwright Test output that the converter must produce later, byte for byte.
- Source files are inputs only. They are not executed in this repo, and they are excluded from ESLint and Prettier so they stay exactly as written.
- The expected specs are real tests. CI type-checks them, lints them and runs them against SauceDemo five times each.

## Expected Spec Conventions

The future emitter must match these rules exactly.

- Line 1 is `// Migrated from: <source path relative to the case folder>`.
- Line 2 is `import { test, expect } from '@playwright/test';`, followed by one blank line.
- Cypress `describe` becomes `test.describe` with the same name, `it` becomes `test` with the same name, and `beforeEach` becomes `test.beforeEach`.
- A Java test class becomes `test.describe('<ClassName>', ...)`, and each test method becomes `test('<methodName>', ...)`.
- A Python test class becomes `test.describe('<ClassName>', ...)`, and module-level test functions become top-level `test('<function_name>', ...)`.
- Names are copied verbatim.
- Driver creation and `quit()` are removed, because Playwright's `page` fixture replaces them. A `driver.get(...)` inside a setup method becomes `test.beforeEach` with `page.goto(...)`.
- Locators are copied verbatim: `By.id("x")` becomes `page.locator('#x')`, `By.cssSelector(s)` and `By.CSS_SELECTOR, s` become `page.locator(s)`, and `cy.get(s)` becomes `page.locator(s)`.
- `type`, `sendKeys` and `send_keys` become `fill`. `click` stays `click`.
- A URL that contains `/inventory.html` becomes `await expect(page).toHaveURL(/\/inventory\.html/);`.
- Exact text equality becomes `toHaveText`, contains becomes `toContainText`, and a visibility wait or `be.visible` becomes `toBeVisible`.
- Every action and assertion is awaited. Strings use single quotes. Files are formatted with Prettier using the repo config.
