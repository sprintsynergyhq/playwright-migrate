// Hand-built IR for fixtures/saucedemo/cases/login-success. The extractors in PR 4, PR 6 and PR 7
// must produce IR that gives the same report and the same emitted spec.
import type { MigrationFile } from '../../src/core/ir.js';
import type { SourceFramework } from '../../src/core/types.js';
import {
  action,
  css,
  expectStep,
  fill,
  goto,
  hook,
  removed,
  spanReader,
  suite,
  test,
} from './helpers.js';

const DIR = 'cases/login-success';
const URL = 'https://www.saucedemo.com/';

function cypress(): MigrationFile {
  const sourcePath = 'cypress-js/login-success.cy.js';
  const at = spanReader(DIR, sourcePath);
  return {
    sourcePath,
    framework: 'cypress-js',
    sourceAssertions: 2,
    sourceStatements: 6,
    fileFlags: [],
    items: [
      suite('Login', at(1, 13), [
        hook('beforeEach', at(2, 4), [goto(at(3), URL)]),
        test('logs in with the standard user', at(6, 12), [
          fill(at(7), css('[data-test="username"]'), 'standard_user'),
          fill(at(8), css('[data-test="password"]'), 'secret_sauce'),
          action(at(9), 'click', css('[data-test="login-button"]')),
          expectStep(at(10), 'urlContains', 'page', { expected: '/inventory.html' }),
          expectStep(at(11), 'text', css('[data-test="title"]'), { expected: 'Products' }),
        ]),
      ]),
    ],
  };
}

function python(): MigrationFile {
  const sourcePath = 'selenium-python/test_login_success.py';
  const at = spanReader(DIR, sourcePath);
  return {
    sourcePath,
    framework: 'selenium-python',
    sourceAssertions: 2,
    sourceStatements: 8,
    fileFlags: [],
    items: [
      suite('TestLoginSuccess', at(5, 18), [
        hook('beforeEach', at(6, 8), [
          removed(at(7), 'driver-lifecycle', 'CORE_DRIVER_LIFECYCLE'),
          goto(at(8), URL),
        ]),
        hook('afterEach', at(10, 11), [
          removed(at(11), 'driver-lifecycle', 'CORE_DRIVER_LIFECYCLE'),
        ]),
        test('test_login_with_standard_user', at(13, 18), [
          fill(at(14), css('#user-name'), 'standard_user'),
          fill(at(15), css('[data-test="password"]'), 'secret_sauce'),
          action(at(16), 'click', css('#login-button')),
          expectStep(at(17), 'urlContains', 'page', { expected: '/inventory.html' }),
          expectStep(at(18), 'text', css('[data-test="title"]'), { expected: 'Products' }),
        ]),
      ]),
    ],
  };
}

function java(): MigrationFile {
  const sourcePath = 'selenium-java/LoginSuccessTest.java';
  const at = spanReader(DIR, sourcePath);
  return {
    sourcePath,
    framework: 'selenium-java',
    sourceAssertions: 2,
    sourceStatements: 8,
    fileFlags: [],
    items: [
      suite('LoginSuccessTest', at(13, 35), [
        hook('beforeEach', at(16, 20), [
          removed(at(18), 'driver-lifecycle', 'CORE_DRIVER_LIFECYCLE'),
          goto(at(19), URL),
        ]),
        hook('afterEach', at(22, 25), [
          removed(at(24), 'driver-lifecycle', 'CORE_DRIVER_LIFECYCLE'),
        ]),
        test('loginWithStandardUser', at(27, 34), [
          fill(at(29), css('#user-name'), 'standard_user'),
          fill(at(30), css('[data-test="password"]'), 'secret_sauce'),
          action(at(31), 'click', css('#login-button')),
          expectStep(at(32), 'urlContains', 'page', { expected: '/inventory.html' }),
          expectStep(at(33), 'text', css('[data-test="title"]'), { expected: 'Products' }),
        ]),
      ]),
    ],
  };
}

export function loginSuccessIr(): Record<SourceFramework, MigrationFile> {
  return { 'cypress-js': cypress(), 'selenium-python': python(), 'selenium-java': java() };
}
