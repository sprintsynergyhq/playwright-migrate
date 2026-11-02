// Selenium logic shared by the Python and Java extractors: By locators, values, wait conditions,
// assertions and the clickable-wait check. The language extractors read the syntax tree and call
// these helpers, so both languages map the same way.
import type {
  ActionStep,
  AssertionKind,
  AssertStep,
  Flag,
  Locator,
  LocatorBase,
  RemovedReason,
  RemovedStep,
  SourceSpan,
  Step,
  WaitStep,
} from '../../core/ir.js';
import type { RuleId } from '../../core/rules.js';
import { Blocked, blockedStep, makeFlag, withStatus } from '../shared.js';

export type ByKind =
  'id' | 'className' | 'name' | 'tagName' | 'css' | 'xpath' | 'linkText' | 'partialLinkText';

// Python By.ID and Java By.id name the same strategy.
export const BY_NAMES: Readonly<Record<string, ByKind>> = {
  ID: 'id',
  CLASS_NAME: 'className',
  NAME: 'name',
  TAG_NAME: 'tagName',
  CSS_SELECTOR: 'css',
  XPATH: 'xpath',
  LINK_TEXT: 'linkText',
  PARTIAL_LINK_TEXT: 'partialLinkText',
  id: 'id',
  className: 'className',
  name: 'name',
  tagName: 'tagName',
  cssSelector: 'css',
  xpath: 'xpath',
  linkText: 'linkText',
  partialLinkText: 'partialLinkText',
};

// A located element or list, with the INFO notes its locator needs (XPath, text locator).
export type Found = { locator: Locator; notes: Flag[] };

const CSS_IDENT = /^-?[A-Za-z_][\w-]*$/;
const TAG = /^[A-Za-z][\w-]*$/;

function attributeSelector(name: string, value: string, kind: ByKind): string {
  if (/["\\\n]/.test(value)) {
    throw new Blocked('CORE_UNSUPPORTED_LOCATOR', { detail: `${kind} "${value}"` });
  }
  return `[${name}="${value}"]`;
}

// The Playwright locator for a By strategy and value. line is where the locator is written.
export function byLocator(kind: ByKind, value: string, line: number): Found {
  const unsupported = (): Blocked =>
    new Blocked('CORE_UNSUPPORTED_LOCATOR', { detail: `${kind} "${value}"` });
  const css = (selector: string): Found => ({
    locator: { strategy: 'css', value: selector, chain: [] },
    notes: [],
  });
  if (value === '') throw unsupported();
  switch (kind) {
    case 'id':
      return css(CSS_IDENT.test(value) ? `#${value}` : attributeSelector('id', value, kind));
    case 'className':
      if (!CSS_IDENT.test(value)) throw unsupported();
      return css(`.${value}`);
    case 'name':
      return css(attributeSelector('name', value, kind));
    case 'tagName':
      if (!TAG.test(value)) throw unsupported();
      return css(value.toLowerCase());
    case 'css':
      return css(value);
    case 'xpath':
      return {
        locator: { strategy: 'xpath', value, chain: [] },
        notes: [makeFlag('CORE_XPATH', line)],
      };
    case 'linkText':
    case 'partialLinkText': {
      const options = kind === 'linkText' ? { name: value, exact: true } : { name: value };
      return {
        locator: { strategy: 'role', value: 'link', options, chain: [] },
        notes: [makeFlag('CORE_TEXT_LOCATOR', line)],
      };
    }
  }
}

// child located inside parent, as in parent.find_element(...).
export function chainFound(parent: Found, child: Found): Found {
  const { strategy, value, options } = child.locator;
  const base: LocatorBase = options ? { strategy, value, options } : { strategy, value };
  return {
    locator: {
      ...parent.locator,
      chain: [...parent.locator.chain, { kind: 'locator', ...base }, ...child.locator.chain],
    },
    notes: [...parent.notes, ...child.notes],
  };
}

// One element of a list: elements[index]. -1 is the last element.
export function nthFound(list: Found, index: number): Found {
  if (index < -1) throw new Blocked('CORE_UNSUPPORTED_LOCATOR', { detail: `index ${index}` });
  const item = index === -1 ? ({ kind: 'last' } as const) : ({ kind: 'nth', index } as const);
  return { locator: { ...list.locator, chain: [...list.locator.chain, item] }, notes: list.notes };
}

export type State = 'displayed' | 'enabled' | 'selected';

// What a Selenium expression stands for.
export type Value =
  | { kind: 'driver' }
  | { kind: 'wait' }
  | { kind: 'element'; found: Found }
  | { kind: 'elements'; found: Found }
  | { kind: 'select'; found: Found }
  | { kind: 'url' }
  | { kind: 'title' }
  | { kind: 'text'; found: Found }
  | { kind: 'attribute'; found: Found; name: string }
  | { kind: 'state'; found: Found; state: State }
  | { kind: 'count'; found: Found }
  | { kind: 'literal'; value: string | number | boolean };

// An assertion before it gets a span and flags.
export type AssertSpec = {
  assertion: AssertionKind;
  target: Locator | 'page';
  expected?: string | number;
  attribute?: string;
  negated: boolean;
  notes: Flag[];
};

const unsupportedAssertion = (detail: string): Blocked =>
  new Blocked('CORE_UNSUPPORTED_ASSERTION', { detail });

// actual == expected. One side must be a literal; the other side is what is checked, so the
// argument order of assertEquals does not matter.
export function equalsAssertion(a: Value, b: Value, negated: boolean, detail: string): AssertSpec {
  const [actual, expected] = b.kind === 'literal' ? [a, b] : [b, a];
  if (expected.kind !== 'literal' || actual.kind === 'literal') throw unsupportedAssertion(detail);
  const value = expected.value;
  if (typeof value === 'boolean') {
    if (actual.kind !== 'state') throw unsupportedAssertion(detail);
    return truthAssertion(actual, value !== negated, detail);
  }
  const str = typeof value === 'string';
  if (actual.kind === 'url' && str) {
    return { assertion: 'url', target: 'page', expected: value, negated, notes: [] };
  }
  if (actual.kind === 'title' && str) {
    return { assertion: 'title', target: 'page', expected: value, negated, notes: [] };
  }
  if (actual.kind === 'text' && str) {
    const { locator, notes } = actual.found;
    return { assertion: 'text', target: locator, expected: value, negated, notes };
  }
  if (actual.kind === 'attribute' && str) {
    const { locator, notes } = actual.found;
    if (actual.name === 'value') {
      return { assertion: 'value', target: locator, expected: value, negated, notes };
    }
    const attribute = actual.name;
    return { assertion: 'attribute', target: locator, attribute, expected: value, negated, notes };
  }
  if (
    actual.kind === 'count' &&
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0
  ) {
    const { locator, notes } = actual.found;
    return { assertion: 'count', target: locator, expected: value, negated, notes };
  }
  throw unsupportedAssertion(detail);
}

// item in container, as in "x" in driver.current_url or text.contains("x").
export function containsAssertion(
  container: Value,
  item: Value,
  negated: boolean,
  detail: string,
): AssertSpec {
  if (item.kind !== 'literal' || typeof item.value !== 'string') throw unsupportedAssertion(detail);
  const expected = item.value;
  if (container.kind === 'url') {
    return { assertion: 'urlContains', target: 'page', expected, negated, notes: [] };
  }
  if (container.kind === 'title') {
    return { assertion: 'titleContains', target: 'page', expected, negated, notes: [] };
  }
  if (container.kind === 'text') {
    const { locator, notes } = container.found;
    return { assertion: 'containText', target: locator, expected, negated, notes };
  }
  throw unsupportedAssertion(detail);
}

// A state check such as is_displayed() or isEnabled(). truthy is false for assertFalse or not.
export function truthAssertion(value: Value, truthy: boolean, detail: string): AssertSpec {
  if (value.kind !== 'state') throw unsupportedAssertion(detail);
  const { locator, notes } = value.found;
  switch (value.state) {
    case 'displayed':
      return { assertion: truthy ? 'visible' : 'hidden', target: locator, negated: false, notes };
    case 'enabled':
      return { assertion: truthy ? 'enabled' : 'disabled', target: locator, negated: false, notes };
    case 'selected':
      return { assertion: 'checked', target: locator, negated: !truthy, notes };
  }
}

// Expected conditions, by Python and Java name. args says what the condition takes:
// found (a locator or an element), found+text (a locator or element, then a string) or text.
export type ConditionRow =
  | { assertion: AssertionKind | 'clickable'; args: 'found' | 'found+text' | 'text' }
  | { blocked: RuleId };

export const WAIT_CONDITIONS: Readonly<Record<string, ConditionRow>> = {
  visibility_of_element_located: { assertion: 'visible', args: 'found' },
  visibilityOfElementLocated: { assertion: 'visible', args: 'found' },
  visibility_of: { assertion: 'visible', args: 'found' },
  visibilityOf: { assertion: 'visible', args: 'found' },
  invisibility_of_element_located: { assertion: 'hidden', args: 'found' },
  invisibilityOfElementLocated: { assertion: 'hidden', args: 'found' },
  invisibility_of_element: { assertion: 'hidden', args: 'found' },
  invisibilityOf: { assertion: 'hidden', args: 'found' },
  presence_of_element_located: { assertion: 'attached', args: 'found' },
  presenceOfElementLocated: { assertion: 'attached', args: 'found' },
  element_to_be_clickable: { assertion: 'clickable', args: 'found' },
  elementToBeClickable: { assertion: 'clickable', args: 'found' },
  element_to_be_selected: { assertion: 'checked', args: 'found' },
  elementToBeSelected: { assertion: 'checked', args: 'found' },
  text_to_be_present_in_element: { assertion: 'containText', args: 'found+text' },
  textToBePresentInElementLocated: { assertion: 'containText', args: 'found+text' },
  textToBePresentInElement: { assertion: 'containText', args: 'found+text' },
  title_is: { assertion: 'title', args: 'text' },
  titleIs: { assertion: 'title', args: 'text' },
  title_contains: { assertion: 'titleContains', args: 'text' },
  titleContains: { assertion: 'titleContains', args: 'text' },
  url_to_be: { assertion: 'url', args: 'text' },
  urlToBe: { assertion: 'url', args: 'text' },
  url_contains: { assertion: 'urlContains', args: 'text' },
  urlContains: { assertion: 'urlContains', args: 'text' },
  alert_is_present: { blocked: 'CORE_WINDOW' },
  alertIsPresent: { blocked: 'CORE_WINDOW' },
  number_of_windows_to_be: { blocked: 'CORE_WINDOW' },
  numberOfWindowsToBe: { blocked: 'CORE_WINDOW' },
  frame_to_be_available_and_switch_to_it: { blocked: 'CORE_FRAME' },
  frameToBeAvailableAndSwitchToIt: { blocked: 'CORE_FRAME' },
};

// The result of a wait: an assertion, or a clickable wait on a locator.
export type WaitResult = { spec: AssertSpec } | { clickable: Found };

// Builds the wait for a condition row. negated is true for until_not.
export function waitResult(
  row: ConditionRow,
  found: Found | undefined,
  text: string | undefined,
  negated: boolean,
): WaitResult {
  if ('blocked' in row) throw new Blocked(row.blocked);
  if (row.assertion === 'clickable') {
    if (!found || negated) throw new Blocked('CORE_CUSTOM_WAIT');
    return { clickable: found };
  }
  if (row.args === 'text') {
    if (text === undefined) throw new Blocked('CORE_CUSTOM_WAIT');
    return {
      spec: { assertion: row.assertion, target: 'page', expected: text, negated, notes: [] },
    };
  }
  if (!found || (row.args === 'found+text' && text === undefined)) {
    throw new Blocked('CORE_CUSTOM_WAIT');
  }
  const spec: AssertSpec = {
    assertion: row.assertion,
    target: found.locator,
    negated,
    notes: found.notes,
  };
  if (row.args === 'found+text') spec.expected = text;
  return { spec };
}

// Keys constants that map to a Playwright key name for press().
export const KEYS: Readonly<Record<string, string>> = {
  ENTER: 'Enter',
  RETURN: 'Enter',
  TAB: 'Tab',
  ESCAPE: 'Escape',
  BACK_SPACE: 'Backspace',
  BACKSPACE: 'Backspace',
  DELETE: 'Delete',
  ARROW_DOWN: 'ArrowDown',
  ARROW_UP: 'ArrowUp',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  DOWN: 'ArrowDown',
  UP: 'ArrowUp',
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
};

// Step builders. flags are the INFO notes for the step.
export function assertStep(
  spec: AssertSpec,
  span: SourceSpan,
  origin: AssertStep['origin'],
  extra: Flag[] = [],
): AssertStep {
  const { notes, ...rest } = spec;
  if (rest.expected === undefined) delete rest.expected;
  if (rest.attribute === undefined) delete rest.attribute;
  return withStatus({ kind: 'assert', ...rest, origin, span, flags: [...notes, ...extra] });
}

export function actionStep(
  action: Omit<ActionStep, 'span' | 'status' | 'flags'>,
  span: SourceSpan,
  flags: Flag[],
): ActionStep {
  return withStatus({ ...action, span, flags });
}

export function removedStep(
  reason: RemovedReason,
  ruleId: RuleId,
  span: SourceSpan,
  notes: Flag[] = [],
): RemovedStep {
  return withStatus({
    kind: 'removed',
    reason,
    span,
    flags: [...notes, makeFlag(ruleId, span.startLine)],
  });
}

export function sleepStep(ms: number, span: SourceSpan): WaitStep {
  if (!Number.isInteger(ms) || ms < 0) throw new Blocked('CORE_CUSTOM_WAIT');
  return withStatus({
    kind: 'wait',
    policy: 'fixed',
    ms,
    span,
    flags: [makeFlag('CORE_FIXED_WAIT', span.startLine)],
  });
}

// A standalone wait for clickable is removed only when the next step acts on the same locator.
// Otherwise it becomes a CORE_CUSTOM_WAIT block. pending maps each removed wait to its locator.
export function resolveClickableWaits(steps: Step[], pending: Map<Step, Locator>): Step[] {
  return steps.map((step, i) => {
    const locator = pending.get(step);
    if (!locator) return step;
    const next = steps[i + 1];
    if (next?.kind === 'action' && JSON.stringify(next.target) === JSON.stringify(locator)) {
      return step;
    }
    return blockedStep(new Blocked('CORE_CUSTOM_WAIT'), step.span, 0);
  });
}

// A short, one-line form of an expression for CORE_UNSUPPORTED_ASSERTION.
export function shortText(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat;
}
