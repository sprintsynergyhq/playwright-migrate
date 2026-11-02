# playwright-migrate

`playwright-migrate` is a command line tool that will convert Selenium (Java and Python) and Cypress (JavaScript) tests into Playwright Test suites written in TypeScript. It keeps each test's intent, steps, locators and assertions, and it lists anything it cannot convert safely in a report, so nothing turns into a test that passes silently.

## Status

This is the project scaffold. Only the `detect` command works today. The `migrate` command is a placeholder that exits with code 1 and says conversion is not implemented yet.

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

## Usage

The package is not published yet. Build it locally, then run the CLI from the repo folder:

```sh
npm ci
npm run build
npx playwright-migrate detect <path>
```

`detect` prints the detected framework for each source file under `<path>` and a summary line. Add `--json` to print the result as JSON.

## Development

Requires Node.js 22.13 or later.

| Script                    | What It Does                                                         |
| ------------------------- | -------------------------------------------------------------------- |
| `npm run build`           | Compiles `src/` to `dist/`.                                          |
| `npm run typecheck`       | Type-checks the source, tests, expected specs and config files.      |
| `npm run lint`            | Runs ESLint.                                                         |
| `npm run format`          | Formats the repo with Prettier.                                      |
| `npm run format:check`    | Checks formatting with Prettier.                                     |
| `npm run check:style`     | Fails if any tracked file contains an em dash or an en dash.         |
| `npm test`                | Runs the unit and golden layout tests with Vitest.                   |
| `npm run test:smoke`      | Runs the built CLI with `--version` and `detect fixtures/saucedemo`. |
| `npm run e2e:expected`    | Runs the expected Playwright specs against SauceDemo in Chromium.    |
| `npm run e2e:expected:5x` | Runs the expected Playwright specs five times each.                  |
| `npm run check`           | Runs lint, format check, style check, typecheck and tests.           |

Before running the expected specs for the first time, install Chromium with `npx playwright install chromium`.

## Fixtures

All fixtures use SauceDemo (https://www.saucedemo.com), a public practice app. Never add client code to this repo. See [fixtures/saucedemo/README.md](fixtures/saucedemo/README.md) for the layout and the expected spec conventions.

## License

MIT. See [LICENSE](LICENSE).

---

Built by SprintSynergy (https://sprintsynergy.com) and maintained by [Muhammad Usman](https://linkedin.com/in/sdet-muhammadusman).
