// Turns the IR into a Playwright Test file. Pure: no file system access.
import { format } from 'prettier';
import type {
  AssertStep,
  Flag,
  Hook,
  Locator,
  LocatorBase,
  LocatorChainItem,
  MigrationFile,
  SourceSpan,
  Step,
  SuiteItem,
  Test,
} from '../core/ir.js';
import { collectTests, deriveTestStatus, hasBlockedSetup } from '../core/status.js';

export const PRETTIER_OPTIONS = {
  parser: 'typescript',
  singleQuote: true,
  printWidth: 100,
  trailingComma: 'all',
} as const;

// A JavaScript string literal. Prettier later picks the quote style.
export function str(value: string): string {
  return JSON.stringify(value);
}

// A regex literal that matches the text anywhere (used for "URL or title contains").
export function containsRegex(text: string): string {
  return `/${text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/`;
}

function locatorCall(base: LocatorBase): string {
  switch (base.strategy) {
    case 'css':
      return `locator(${str(base.value)})`;
    case 'xpath':
      return `locator(${str(`xpath=${base.value}`)})`;
    case 'text':
      return base.options?.exact
        ? `getByText(${str(base.value)}, { exact: true })`
        : `getByText(${str(base.value)})`;
    case 'role': {
      const opts: string[] = [];
      if (base.options?.name !== undefined) opts.push(`name: ${str(base.options.name)}`);
      if (base.options?.exact) opts.push('exact: true');
      return opts.length > 0
        ? `getByRole(${str(base.value)}, { ${opts.join(', ')} })`
        : `getByRole(${str(base.value)})`;
    }
  }
}

function chainCall(item: LocatorChainItem): string {
  switch (item.kind) {
    case 'locator':
      return locatorCall(item);
    case 'nth':
      return `nth(${item.index})`;
    case 'first':
      return 'first()';
    case 'last':
      return 'last()';
    case 'hasText':
      return `filter({ hasText: ${str(item.text)} })`;
  }
}

export function locatorExpr(loc: Locator): string {
  return ['page', locatorCall(loc), ...loc.chain.map(chainCall)].join('.');
}

const MATCHERS: Record<AssertStep['assertion'], string> = {
  visible: 'toBeVisible',
  hidden: 'toBeHidden',
  attached: 'toBeAttached',
  text: 'toHaveText',
  containText: 'toContainText',
  value: 'toHaveValue',
  attribute: 'toHaveAttribute',
  containClass: 'toContainClass',
  enabled: 'toBeEnabled',
  disabled: 'toBeDisabled',
  checked: 'toBeChecked',
  count: 'toHaveCount',
  url: 'toHaveURL',
  urlContains: 'toHaveURL',
  title: 'toHaveTitle',
  titleContains: 'toHaveTitle',
};

function literal(value: string | number): string {
  return typeof value === 'number' ? String(value) : str(value);
}

function assertArgs(step: AssertStep): string {
  const { assertion, expected, attribute } = step;
  if (assertion === 'urlContains' || assertion === 'titleContains') {
    return containsRegex(String(expected));
  }
  if (assertion === 'attribute') {
    const name = str(attribute ?? '');
    return expected === undefined ? name : `${name}, ${literal(expected)}`;
  }
  return expected === undefined ? '' : literal(expected);
}

function assertLine(step: AssertStep): string {
  const subject = step.target === 'page' ? 'page' : locatorExpr(step.target);
  const not = step.negated ? '.not' : '';
  return `await expect(${subject})${not}.${MATCHERS[step.assertion]}(${assertArgs(step)});`;
}

function flagComment(flag: Flag): string {
  return `// playwright-migrate ${flag.level} ${flag.ruleId}: ${flag.message}`;
}

// The source of a blocked step as comments, dedented by the column where the statement starts.
export function sourceComment(item: { span: SourceSpan }): string[] {
  const { startLine, endLine, startColumn, text } = item.span;
  const lines = text.split('\n');
  if (startLine === endLine && lines.length === 1) return [`// Source line ${startLine}: ${text}`];
  const dedent = (line: string, i: number): string => {
    if (i === 0) return line;
    const lead = line.length - line.trimStart().length;
    return line.slice(Math.min(lead, startColumn));
  };
  return [
    `// Source lines ${startLine}-${endLine}:`,
    ...lines.map((l, i) => `//   ${dedent(l, i)}`),
  ];
}

// Code lines for one step. Comments come first. Removed steps give no lines.
export function stepLines(step: Step): { comments: string[]; code: string[] } {
  const comments = step.flags.filter((f) => f.level !== 'INFO').map(flagComment);
  switch (step.kind) {
    case 'navigate': {
      const call = {
        goto: `goto(${str(step.url ?? '')})`,
        reload: 'reload()',
        back: 'goBack()',
        forward: 'goForward()',
      }[step.action];
      return { comments, code: [`await page.${call};`] };
    }
    case 'action': {
      let args = '';
      if (step.action === 'selectOption' && step.select) {
        const s = step.select;
        args =
          s.by === 'valueOrLabel'
            ? str(s.value)
            : s.by === 'index'
              ? `{ index: ${s.index} }`
              : `{ ${s.by}: ${str(s.value)} }`;
      } else if (step.value !== undefined) {
        args = str(step.value);
      }
      return { comments, code: [`await ${locatorExpr(step.target)}.${step.action}(${args});`] };
    }
    case 'assert':
      return { comments, code: [assertLine(step)] };
    case 'wait':
      return { comments, code: [`await page.waitForTimeout(${step.ms});`] };
    case 'removed':
      return { comments, code: [] };
    case 'unknown':
      return { comments: [...comments, ...sourceComment(step)], code: [] };
  }
}

type Body = { lines: string[]; usesPage: boolean; usesExpect: boolean };

function body(steps: Step[]): Body {
  const lines: string[] = [];
  let usesPage = false;
  let usesExpect = false;
  for (const step of steps) {
    const { comments, code } = stepLines(step);
    lines.push(...comments, ...code);
    if (code.length > 0) usesPage = true;
    if (step.kind === 'assert') usesExpect = true;
  }
  return { lines, usesPage, usesExpect };
}

const fixtureArg = (b: Body): string => (b.usesPage ? 'async ({ page }) =>' : 'async () =>');

// A hook is emitted unless every step is removed (for example a driver.quit() teardown).
export function isHookEmitted(hook: Hook): boolean {
  return hook.steps.some((s) => s.kind !== 'removed');
}

// Put at the top of every test when code outside the tests was dropped with a BLOCK flag.
export const SETUP_BLOCKED_COMMENT =
  '// playwright-migrate: code outside this test was not converted, so the test is marked fixme. See the BLOCK flags at the top of the file.';

export function emitPlaywrightRaw(file: MigrationFile): string {
  const setupBlocked = hasBlockedSetup(file);
  const blockedTests = new Set<Test>(
    collectTests(file)
      .filter((t) => deriveTestStatus(t) === 'blocked')
      .map((t) => t.test),
  );
  let usesExpect = false;

  const items = (list: SuiteItem[]): string[] => {
    const chunks: string[][] = [];
    for (const item of list) {
      if (item.type === 'hook') {
        if (!isHookEmitted(item.hook)) continue;
        const b = body(item.hook.steps);
        usesExpect ||= b.usesExpect;
        chunks.push([`test.${item.hook.kind}(${fixtureArg(b)} {`, ...b.lines, '});']);
      } else if (item.type === 'test') {
        const t = item.test;
        const b = body(t.steps);
        usesExpect ||= b.usesExpect;
        const fn = blockedTests.has(t) ? 'test.fixme' : t.skipped ? 'test.skip' : 'test';
        const lines = setupBlocked ? [SETUP_BLOCKED_COMMENT, ...b.lines] : b.lines;
        chunks.push([`${fn}(${str(t.name)}, ${fixtureArg(b)} {`, ...lines, '});']);
      } else {
        const s = item.suite;
        const fn = s.skipped ? 'test.describe.skip' : 'test.describe';
        chunks.push([`${fn}(${str(s.name)}, () => {`, ...items(s.items), '});']);
      }
    }
    return chunks.flatMap((c, i) => (i === 0 ? c : ['', ...c]));
  };

  // WARN and BLOCK file flags print the rule message and the source they point to.
  const fileComments = file.fileFlags
    .filter((f) => f.level !== 'INFO')
    .flatMap((f) => [flagComment(f), ...sourceComment(f)]);
  const main = items(file.items);
  const head = [
    `// Migrated from: ${file.sourcePath}`,
    usesExpect
      ? "import { test, expect } from '@playwright/test';"
      : "import { test } from '@playwright/test';",
    '',
  ];
  const lines = [...head, ...(fileComments.length > 0 ? [...fileComments, ''] : []), ...main];
  return lines.join('\n') + '\n';
}

export async function emitPlaywright(file: MigrationFile): Promise<string> {
  return format(emitPlaywrightRaw(file), PRETTIER_OPTIONS);
}
