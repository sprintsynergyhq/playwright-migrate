# Contributing

## Pull Requests

- Keep each PR small, with one goal.
- Run `npm run check` before you open a PR. CI also runs the build, a smoke test and the expected specs against SauceDemo.
- Fill in the PR template.

## Review

Every PR gets a two-pass review and is merged by a maintainer.

- Pass 1: correctness and the PR's acceptance criteria.
- Pass 2: quality, safety and intent preservation. Each converted test must keep the same steps, order, locators and assertions as its source.

## Fixtures

Fixtures must use SauceDemo (https://www.saucedemo.com) or other public practice apps. Never add client code.

Source fixture files are inputs. Do not change them after they are written, except to fix a real bug. Never rewrite an expected spec just to make a test pass. If an expected spec must change, explain why in the PR description.

## Docs Style

- Simple English with correct grammar.
- Title Case for Markdown headings.
- No em dashes or en dashes. `npm run check:style` checks this.
- No invented numbers, benchmarks or claims.
