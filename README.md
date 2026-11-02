# playwright-migrate

`playwright-migrate` is a command line tool that will convert Selenium (Java and Python) and Cypress (JavaScript) tests into Playwright Test suites written in TypeScript. It keeps each test's intent, steps, locators and assertions, and it lists anything it cannot convert safely in a report, so nothing turns into a test that passes silently.

## Status

Early development. `detect` works for all three sources. `migrate` converts one Cypress JS or Selenium Python file at a time. Selenium Java and folder input are not supported yet.

## Planned Sources And Target

Sources:

- Selenium Java with JUnit 5 and TestNG
- Selenium Python with pytest and unittest
- Cypress JS

Target: Playwright Test in TypeScript.

## How It Will Work

- Deterministic parsing: each source file is parsed into a syntax tree. There is no guessing and no AI step.
- Mapping tables: each source command, locator and assertion maps to its Playwright form through a table of rules.
- A report of what was not converted: every step is listed as converted, converted with a note, or blocked.
- Blocked tests are emitted as `test.fixme`, with the original source kept as a comment, so a blocked test can never pass.
- A source test that cannot be read at all, for example a Cypress test whose callback takes a `done` parameter, is not emitted. Its source is printed as a comment under the import, the report lists it as blocked, and its assertions are counted as blocked.
- Code outside the tests that is not converted, for example a module-level statement, a `setUpClass` method or another class member, adds a BLOCK flag. Every test in that file is then emitted as `test.fixme` and listed as blocked, because that code may set up state the tests need.
- `it.only` and `describe.only` are converted without `.only` and get a WARN flag, because `test.only` would skip every other test in the run. `xit`, `xdescribe` and `.skip` become `test.skip` and `test.describe.skip`.

## Usage

The package is not published yet. The npm package will be published as `@sprintsynergy/playwright-migrate`. The command it installs is `playwright-migrate`.

Build it locally, then run the CLI from the repo folder:

```sh
npm ci
npm run build
npx playwright-migrate detect <path>
```

`detect` prints the detected framework for each source file under `<path>` and a summary line. Add `--json` to print the result as JSON.

```sh
npx playwright-migrate migrate path/to/login.cy.js --out playwright-migrated
```

`migrate` writes `login.spec.ts`, `migration-report.json` and `migration-report.md` to the `--out` folder (default `playwright-migrated`). Add `--dry-run` to print the file names without writing anything. The exit code is 0 when nothing is blocked, 2 when at least one test is blocked, and 1 on an error.

## Development

Requires Node.js 22.13 or later.

| Script                    | What It Does                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `npm run build`           | Compiles `src/` to `dist/`.                                                         |
| `npm run typecheck`       | Type-checks the source, tests, expected specs and config files.                     |
| `npm run lint`            | Runs ESLint.                                                                        |
| `npm run format`          | Formats the repo with Prettier.                                                     |
| `npm run format:check`    | Checks formatting with Prettier.                                                    |
| `npm run check:style`     | Fails if any tracked file contains an em dash or an en dash.                        |
| `npm test`                | Runs the unit and golden layout tests with Vitest.                                  |
| `npm run test:smoke`      | Runs the built CLI: `--version`, `detect`, a parse check and a `migrate --dry-run`. |
| `npm run e2e:expected`    | Runs the expected Playwright specs against SauceDemo in Chromium.                   |
| `npm run e2e:expected:5x` | Runs the expected Playwright specs five times each.                                 |
| `npm run check`           | Runs lint, format check, style check, typecheck and tests.                          |

Before running the expected specs for the first time, install Chromium with `npx playwright install chromium`.

## Fixtures

All fixtures use SauceDemo (https://www.saucedemo.com), a public practice app. Never add client code to this repo. See [fixtures/saucedemo/README.md](fixtures/saucedemo/README.md) for the layout and the expected spec conventions.

## License

MIT. See [LICENSE](LICENSE).

---

Built by SprintSynergy (https://sprintsynergy.com) and maintained by [Muhammad Usman](https://linkedin.com/in/sdet-muhammadusman).
