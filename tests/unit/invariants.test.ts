import { describe, expect, it } from 'vitest';
import {
  checkInvariants,
  findInvariantProblems,
  InvariantError,
} from '../../src/core/invariants.js';
import type { AssertStep, MigrationFile, SuiteItem } from '../../src/core/ir.js';
import { blocked, fileFlag, flag } from '../ir-fixtures/helpers.js';
import { loginSuccessIr } from '../ir-fixtures/login-success.js';

const cypress = (): MigrationFile => loginSuccessIr()['cypress-js'];

function testSteps(file: MigrationFile) {
  const suite = file.items[0] as Extract<SuiteItem, { type: 'suite' }>;
  const test = suite.suite.items[1] as Extract<SuiteItem, { type: 'test' }>;
  return test.test.steps;
}

describe('invariants', () => {
  it('passes for a hand-built fixture IR', () => {
    expect(() => checkInvariants(cypress())).not.toThrow();
  });

  it('fails when an assertion is dropped', () => {
    const file = cypress();
    const steps = testSteps(file);
    steps.splice(steps.length - 1, 1);
    file.sourceStatements -= 1;
    expect(() => checkInvariants(file)).toThrow(InvariantError);
    expect(findInvariantProblems(file)).toEqual([
      'assertion accounting: 2 source assertions, but 1 converted and 0 blocked',
    ]);
  });

  it('accepts a dropped assertion that is counted as blocked', () => {
    const file = cypress();
    const steps = testSteps(file);
    const last = steps[steps.length - 1]!;
    steps[steps.length - 1] = blocked(last.span, 'CY_THEN', undefined, 1);
    expect(findInvariantProblems(file)).toEqual([]);
  });

  it('fails when a statement has no step', () => {
    const file = cypress();
    file.sourceStatements += 1;
    expect(findInvariantProblems(file)).toEqual([
      'statement accounting: 7 source statements, but steps cover 6',
    ]);
  });

  it('fails when a step status does not match its flags', () => {
    const file = cypress();
    const step = testSteps(file)[0]!;
    step.status = 'converted';
    expect(findInvariantProblems(file)).toEqual([
      'action step at line 7 has status converted, expected converted_with_note',
    ]);
  });

  it('fails when a BLOCK flag sits on a converted step', () => {
    const file = cypress();
    const step = testSteps(file)[4] as AssertStep;
    step.flags.push(flag('CORE_FRAME', 11));
    step.status = 'blocked';
    expect(findInvariantProblems(file)).toContain(
      'assert step at line 11 has a BLOCK flag but is not an unknown step',
    );
  });

  it('fails when a flag points outside its step', () => {
    const file = cypress();
    testSteps(file)[0]!.flags[0]!.line = 3;
    expect(findInvariantProblems(file)).toEqual([
      'action step at line 7 flag CORE_FILL_REPLACES_VALUE points to line 3, outside the step',
    ]);
  });

  it('fails when a flag level does not match the catalog', () => {
    const file = cypress();
    testSteps(file)[0]!.flags[0]!.level = 'WARN';
    const problems = findInvariantProblems(file);
    expect(problems).toContain(
      'action step at line 7 flag CORE_FILL_REPLACES_VALUE has level WARN, expected INFO',
    );
  });

  it('fails when a source test is neither emitted nor listed as dropped', () => {
    const file = cypress();
    file.sourceTests = 2;
    expect(findInvariantProblems(file)).toEqual([
      'test accounting: 2 source tests, but 1 emitted and 0 dropped',
    ]);
  });

  it('accepts a dropped test and its assertions when a BLOCK file flag lists them', () => {
    const file = cypress();
    file.sourceTests = 2;
    file.sourceAssertions = 3;
    const span = { startLine: 20, endLine: 22, startColumn: 2, text: "it('x', (done) => {\n})" };
    file.fileFlags.push(fileFlag('CORE_UNKNOWN_STATEMENT', span, undefined, 1, [['Login', 'x']]));
    expect(findInvariantProblems(file)).toEqual([]);
  });

  it('fails when a file flag points outside its span or drops tests at WARN level', () => {
    const file = cypress();
    file.sourceTests = 2;
    const span = { startLine: 20, endLine: 20, startColumn: 2, text: 'it.only' };
    const warn = fileFlag('CY_ONLY', span, { name: 'it' }, 0, [['Login', 'x']]);
    warn.line = 21;
    file.fileFlags.push(warn);
    expect(findInvariantProblems(file)).toEqual([
      'file flag CY_ONLY at line 21 points outside its span',
      'file flag CY_ONLY at line 21 drops tests or assertions but is not a BLOCK flag',
    ]);
  });

  it('lists the source path in the error message', () => {
    const file = cypress();
    file.sourceAssertions = 3;
    expect(() => checkInvariants(file)).toThrow(/cypress-js\/login-success\.cy\.js/);
  });
});
