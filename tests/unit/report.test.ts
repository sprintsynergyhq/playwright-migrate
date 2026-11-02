import { describe, expect, it } from 'vitest';
import type { MigrationFile } from '../../src/core/ir.js';
import {
  buildFileReport,
  buildRunReport,
  exitCodeFor,
  exitCodeForReports,
  renderReportJson,
  renderReportMarkdown,
} from '../../src/core/report.js';
import { ExitCode } from '../../src/core/types.js';
import {
  blocked,
  css,
  expectStep,
  fixedWait,
  flag,
  goto,
  hook,
  suite,
  test,
} from '../ir-fixtures/helpers.js';
import { loginLockedOutIr } from '../ir-fixtures/login-locked-out.js';
import { loginSuccessIr } from '../ir-fixtures/login-success.js';

const span = (startLine: number, text = 'x', endLine = startLine) => ({
  startLine,
  endLine,
  startColumn: 4,
  text,
});

// A small file with a WARN in one test and a BLOCK in another.
function mixedFile(): MigrationFile {
  return {
    sourcePath: 'cypress-js/mixed.cy.js',
    framework: 'cypress-js',
    sourceAssertions: 2,
    sourceStatements: 5,
    fileFlags: [],
    items: [
      suite('Mixed', span(1, 'describe', 20), [
        hook('beforeEach', span(2, 'beforeEach', 4), [goto(span(3), 'https://www.saucedemo.com/')]),
        test('warns', span(6, 'it', 9), [
          fixedWait(span(7), 500),
          expectStep(span(8), 'visible', css('[data-test="title"]')),
        ]),
        test('blocks', span(11, 'it', 14), [
          blocked(span(12, "cy.login('a', 'b');"), 'CY_CUSTOM_COMMAND', { name: 'login' }),
          blocked(span(13), 'CY_THEN', undefined, 1),
        ]),
      ]),
    ],
  };
}

describe('file report', () => {
  it('derives test and file status from flags', () => {
    const r = buildFileReport(mixedFile(), 'mixed.spec.ts');
    expect(r.tests.map((t) => [t.title, t.status])).toEqual([
      ['Mixed > warns', 'converted_with_warnings'],
      ['Mixed > blocks', 'blocked'],
    ]);
    expect(r.status).toBe('blocked');
    expect(r.counts).toEqual({
      tests: 2,
      steps: 5,
      sourceAssertions: 2,
      outputExpects: 1,
      blockedAssertions: 1,
      info: 0,
      warn: 1,
      block: 2,
    });
  });

  it('marks a file converted_with_warnings when only WARN flags exist', () => {
    const file = mixedFile();
    const s = file.items[0];
    if (s?.type !== 'suite') throw new Error('fixture shape');
    s.suite.items.pop();
    expect(buildFileReport(file, null).status).toBe('converted_with_warnings');
  });

  it('marks every test blocked when a hook step is blocked', () => {
    const file = mixedFile();
    const s = file.items[0];
    if (s?.type !== 'suite' || s.suite.items[0]?.type !== 'hook') throw new Error('fixture shape');
    s.suite.items[0].hook.steps.push(blocked(span(3), 'CORE_UNKNOWN_STATEMENT'));
    expect(buildFileReport(file, null).tests.every((t) => t.status === 'blocked')).toBe(true);
  });

  it('marks a file blocked when a file flag is BLOCK', () => {
    const file = loginSuccessIr()['selenium-java'];
    file.fileFlags.push(flag('CORE_UNSUPPORTED_MEMBER', 14, { detail: 'helper' }));
    expect(buildFileReport(file, null).status).toBe('blocked');
  });

  it('reports converted for the login fixtures', () => {
    const all = [...Object.values(loginSuccessIr()), ...Object.values(loginLockedOutIr())];
    expect(all.map((f) => buildFileReport(f, null).status)).toEqual(Array(6).fill('converted'));
  });
});

describe('exit codes', () => {
  it('returns 0 when nothing is blocked', () => {
    const reports = Object.values(loginSuccessIr()).map((f) => buildFileReport(f, null));
    expect(exitCodeForReports(reports)).toBe(ExitCode.Ok);
    expect(exitCodeFor({ files: reports })).toBe(0);
  });

  it('returns 2 when any file is blocked', () => {
    const reports = [
      buildFileReport(loginSuccessIr()['cypress-js'], null),
      buildFileReport(mixedFile(), null),
    ];
    expect(exitCodeFor({ files: reports })).toBe(2);
  });

  it('returns 1 on a tool error', () => {
    expect(exitCodeFor({ error: new Error('parse failed') })).toBe(1);
  });
});

describe('run report', () => {
  const run = buildRunReport('fixtures', '0.0.0', [
    buildFileReport(mixedFile(), 'mixed.spec.ts'),
    buildFileReport(loginSuccessIr()['cypress-js'], null),
  ]);

  it('sorts files by source path and sums the flags', () => {
    expect(run.files.map((f) => f.source)).toEqual([
      'cypress-js/login-success.cy.js',
      'cypress-js/mixed.cy.js',
    ]);
    expect(run.summary).toEqual({
      files: 2,
      converted: 1,
      convertedWithWarnings: 0,
      blocked: 1,
      info: 2,
      warn: 1,
      block: 2,
    });
    expect(run.exitCode).toBe(2);
  });

  it('renders stable JSON', () => {
    const json = renderReportJson(run);
    expect(json.endsWith('\n')).toBe(true);
    expect(JSON.parse(json)).toEqual(run);
    expect(renderReportJson(run)).toBe(json);
  });

  it('renders Markdown with a summary table and one section per file', () => {
    const md = renderReportMarkdown(run);
    expect(md).toContain('# Migration Report');
    expect(md).toContain('| 2 | 1 | 0 | 1 | 2 | 1 | 2 |');
    expect(md).toContain('### cypress-js/mixed.cy.js');
    expect(md).toContain('- Output: mixed.spec.ts');
    expect(md).toContain('- Output: not written');
    expect(md).toContain(
      '| 12 | BLOCK | CY_CUSTOM_COMMAND | Custom command cy.login is not converted. Port it to a helper function or a fixture. |',
    );
    expect(md).not.toMatch(/[\u2013\u2014]/);
  });
});
