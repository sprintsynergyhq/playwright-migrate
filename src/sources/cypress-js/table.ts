// Mapping table for Cypress JS: commands, chain methods and assertion chainers.
// Data only. The extractor in extract.ts reads it, and the docs (PR 10) are generated from it.
import type { ActionKind, AssertionKind } from '../../core/ir.js';

// Built-in Cypress commands (cy.<name>). A cy.<name> call that is not in this list is a custom
// command (CY_CUSTOM_COMMAND). A listed command without a mapping is CY_UNSUPPORTED_COMMAND.
export const BUILTIN_COMMANDS: readonly string[] = [
  'as',
  'blur',
  'check',
  'children',
  'clear',
  'clearAllCookies',
  'clearAllLocalStorage',
  'clearAllSessionStorage',
  'clearCookie',
  'clearCookies',
  'clearLocalStorage',
  'click',
  'clock',
  'closest',
  'contains',
  'dblclick',
  'debug',
  'document',
  'each',
  'end',
  'eq',
  'exec',
  'filter',
  'find',
  'first',
  'fixture',
  'focus',
  'focused',
  'get',
  'getAllCookies',
  'getCookie',
  'getCookies',
  'go',
  'hash',
  'intercept',
  'invoke',
  'its',
  'last',
  'location',
  'log',
  'next',
  'nextAll',
  'nextUntil',
  'not',
  'origin',
  'parent',
  'parents',
  'parentsUntil',
  'pause',
  'prev',
  'prevAll',
  'prevUntil',
  'readFile',
  'reload',
  'request',
  'rightclick',
  'root',
  'screenshot',
  'scrollIntoView',
  'scrollTo',
  'select',
  'selectFile',
  'session',
  'setCookie',
  'shadow',
  'siblings',
  'spread',
  'spy',
  'stub',
  'submit',
  'task',
  'then',
  'tick',
  'title',
  'trigger',
  'type',
  'uncheck',
  'url',
  'viewport',
  'visit',
  'wait',
  'window',
  'within',
  'wrap',
  'writeFile',
];

// Actions on an element. Each row: Cypress method, Playwright action, and the INFO rule if any.
// type() and select() take one argument. The others take none.
export const ACTIONS: Readonly<
  Record<string, { action: ActionKind; info?: 'CORE_FILL_REPLACES_VALUE' }>
> = {
  click: { action: 'click' },
  dblclick: { action: 'dblclick' },
  type: { action: 'fill', info: 'CORE_FILL_REPLACES_VALUE' },
  clear: { action: 'clear' },
  check: { action: 'check' },
  uncheck: { action: 'uncheck' },
  select: { action: 'selectOption' },
};

// What an assertion row needs from the should() arguments after the chainer.
// none: no value. value: one string. number: one integer of 0 or more.
export type AssertionArgs = 'none' | 'value' | 'number';

export type AssertionRow = { assertion: AssertionKind; args: AssertionArgs };

// Chainers on an element subject. A "not." prefix negates any row.
export const ELEMENT_ASSERTIONS: Readonly<Record<string, AssertionRow>> = {
  'be.visible': { assertion: 'visible', args: 'none' },
  exist: { assertion: 'attached', args: 'none' },
  'have.text': { assertion: 'text', args: 'value' },
  contain: { assertion: 'containText', args: 'value' },
  'contain.text': { assertion: 'containText', args: 'value' },
  'include.text': { assertion: 'containText', args: 'value' },
  'have.value': { assertion: 'value', args: 'value' },
  'have.length': { assertion: 'count', args: 'number' },
};

// Chainers on cy.url() and cy.title().
export const URL_ASSERTIONS: Readonly<Record<string, AssertionRow>> = {
  include: { assertion: 'urlContains', args: 'value' },
  contain: { assertion: 'urlContains', args: 'value' },
  eq: { assertion: 'url', args: 'value' },
  equal: { assertion: 'url', args: 'value' },
};

export const TITLE_ASSERTIONS: Readonly<Record<string, AssertionRow>> = {
  include: { assertion: 'titleContains', args: 'value' },
  contain: { assertion: 'titleContains', args: 'value' },
  eq: { assertion: 'title', args: 'value' },
  equal: { assertion: 'title', args: 'value' },
};
