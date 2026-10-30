// Hand-built IR for fixtures/saucedemo/cases/login-locked-out.
import type { MigrationFile } from '../../src/core/ir.js';
import type { SourceFramework } from '../../src/core/types.js';
import {
  action,
  css,
  expectStep,
  fill,
  flag,
  goto,
  hook,
  removed,
  spanReader,
  suite,
  test,
} from './helpers.js';

const DIR = 'cases/login-locked-out';
const URL = 'https://www.saucedemo.com/';
const ERROR = '[data-test="error"]';
const MESSAGE = 'Sorry, this user has been locked out.';

function cypress(): MigrationFile {
  const sourcePath = 'cypress-js/login-locked-out.cy.js';
  const at = spanReader(DIR, sourcePath);
  return {
    sourcePath,
    framework: 'cypress-js',
    sourceAssertions: 2,
    sourceStatements: 6,
    fileFlags: [],
    items: [
      suite('Login', at(1, 10), [
        test('shows an error for the locked out user', at(2, 9), [
          goto(at(3), URL),
          fill(at(4), css('[data-test="username"]'), 'locked_out_user'),
          fill(at(5), css('[data-test="password"]'), 'secret_sauce'),
          action(at(6), 'click', css('[data-test="login-button"]')),
          expectStep(at(7), 'visible', css(ERROR)),
          expectStep(at(8), 'containText', css(ERROR), { expected: MESSAGE }),
        ]),
      ]),
    ],
  };
}

function python(): MigrationFile {
  const sourcePath = 'selenium-python/test_login_locked_out.py';
  const at = spanReader(DIR, sourcePath);
  return {
    sourcePath,
    framework: 'selenium-python',
    sourceAssertions: 1,
    sourceStatements: 6,
    // The driver fixture (lines 8 to 12) is replaced by the page fixture.
    fileFlags: [flag('CORE_DRIVER_LIFECYCLE', 8)],
    items: [
      test('test_locked_out_user_sees_error', at(15, 23), [
        goto(at(16), URL),
        fill(at(17), css('#user-name'), 'locked_out_user'),
        fill(at(18), css('[data-test="password"]'), 'secret_sauce'),
        action(at(19), 'click', css('#login-button')),
        expectStep(at(20, 22), 'visible', css(ERROR), { origin: 'wait' }, [
          flag('CORE_STORED_ELEMENT', 20),
        ]),
        expectStep(at(23), 'containText', css(ERROR), { expected: MESSAGE }),
      ]),
    ],
  };
}

function java(): MigrationFile {
  const sourcePath = 'selenium-java/LoginLockedOutTest.java';
  const at = spanReader(DIR, sourcePath);
  return {
    sourcePath,
    framework: 'selenium-java',
    sourceAssertions: 1,
    sourceStatements: 8,
    fileFlags: [],
    items: [
      suite('LoginLockedOutTest', at(16, 39), [
        hook('beforeEach', at(19, 22), [
          removed(at(21), 'driver-lifecycle', 'CORE_DRIVER_LIFECYCLE'),
        ]),
        hook('afterEach', at(24, 27), [
          removed(at(26), 'driver-lifecycle', 'CORE_DRIVER_LIFECYCLE'),
        ]),
        test('lockedOutUserSeesError', at(29, 38), [
          goto(at(31), URL),
          fill(at(32), css('#user-name'), 'locked_out_user'),
          fill(at(33), css('[data-test="password"]'), 'secret_sauce'),
          action(at(34), 'click', css('#login-button')),
          expectStep(at(35, 36), 'visible', css(ERROR), { origin: 'wait' }, [
            flag('CORE_STORED_ELEMENT', 35),
          ]),
          expectStep(at(37), 'containText', css(ERROR), { expected: MESSAGE }),
        ]),
      ]),
    ],
  };
}

export function loginLockedOutIr(): Record<SourceFramework, MigrationFile> {
  return { 'cypress-js': cypress(), 'selenium-python': python(), 'selenium-java': java() };
}
