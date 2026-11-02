# Changelog

All notable changes to `@sprintsynergy/playwright-migrate` are listed here. The project follows [Semantic Versioning](https://semver.org). Until 1.0, a minor version can change the command line options and the library API.

## 0.1.0

First release.

### Added

- `detect`: finds the source framework of a file or of every file under a folder: Cypress JS, Selenium Python or Selenium Java.
- `migrate`: converts one file or a folder to Playwright Test in TypeScript.
  - Cypress JS: visits, element actions, `should` and `and` assertions, chains, `within`, `it.only` and `describe.only` (converted without `.only`, with a WARN flag), skips, and `beforeEach` and `afterEach` hooks.
  - Selenium Python with pytest and unittest, and Selenium Java with JUnit 5 and TestNG: locators, actions, explicit waits, keys and assertions. Driver setup and teardown are removed.
  - Blocked steps (for example `cy.intercept`, aliases, custom commands, frames, windows and JavaScript executor calls) are never guessed. The test is emitted as `test.fixme` with its source kept as a comment, so it cannot pass.
  - When code outside the tests is not converted, such as a module-level statement, `setUpClass`, `@BeforeAll` or another class member, every test in that file is emitted as `test.fixme`, because that code may set up state the tests need.
  - A folder run mirrors the folder layout and writes a `playwright.config.ts` (Chromium, retries 0). `--from` limits the run to one framework, `--dry-run` writes nothing, and `--force` overwrites existing files.
  - Writes `migration-report.json` (with a JSON schema in `schemas/`) and `migration-report.md`, with an INFO, WARN or BLOCK flag for every step that needs attention.
  - Exit codes: 0 when nothing is blocked, 2 when a test is blocked, 1 on an error.
- `verify`: runs the converted specs of a migrated folder with Playwright, five times each by default with no retries, and adds the counts to both reports. Exit code 0 only when at least one test passed and none failed or were flaky.
- Library API with type declarations, including `convertSource`, `planMigration` and `writeMigration`.
- `docs/mapping.md`, the mapping reference generated from the rule catalog and the mapping tables.
