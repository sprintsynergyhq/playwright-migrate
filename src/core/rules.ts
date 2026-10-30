// Rule catalog: the single source of rule IDs, levels and messages.
// Extractors (PR 4 to PR 7) only reference these IDs. Docs (PR 10) are generated from this list.

export const FLAG_LEVELS = ['INFO', 'WARN', 'BLOCK'] as const;
export type FlagLevel = (typeof FLAG_LEVELS)[number];

export type RuleSource = 'all' | 'cypress-js' | 'selenium' | 'selenium-python' | 'selenium-java';

export type RuleDefinition = {
  id: string;
  level: FlagLevel;
  appliesTo: RuleSource;
  title: string;
  message: string;
};

export const RULES = [
  {
    id: 'CORE_UNKNOWN_STATEMENT',
    level: 'BLOCK',
    appliesTo: 'all',
    title: 'Unrecognized statement',
    message: 'Statement not recognized, so it was not converted. Convert it by hand.',
  },
  {
    id: 'CORE_UNSUPPORTED_LOCATOR',
    level: 'BLOCK',
    appliesTo: 'all',
    title: 'Unsupported locator',
    message: 'Locator {detail} is not supported in v0.1. Convert it by hand.',
  },
  {
    id: 'CORE_UNSUPPORTED_ASSERTION',
    level: 'BLOCK',
    appliesTo: 'all',
    title: 'Unsupported assertion',
    message: 'Assertion {detail} is not supported in v0.1. Convert it by hand.',
  },
  {
    id: 'CORE_UNSUPPORTED_MEMBER',
    level: 'BLOCK',
    appliesTo: 'selenium',
    title: 'Unsupported class member',
    message:
      'Class member {detail} is not converted. Move shared setup into a hook or a fixture by hand.',
  },
  {
    id: 'CORE_FIXED_WAIT',
    level: 'WARN',
    appliesTo: 'all',
    title: 'Fixed wait kept',
    message:
      'Fixed wait kept. Replace it with a web-first assertion on the condition the test needs.',
  },
  {
    id: 'CORE_CUSTOM_WAIT',
    level: 'BLOCK',
    appliesTo: 'selenium',
    title: 'Custom wait condition',
    message: 'Wait with a custom condition is not converted. Rewrite it as a web-first assertion.',
  },
  {
    id: 'CORE_FRAME',
    level: 'BLOCK',
    appliesTo: 'selenium',
    title: 'Frame switching',
    message:
      'Frame switching is not converted. Use page.frameLocator for the steps inside the frame.',
  },
  {
    id: 'CORE_WINDOW',
    level: 'BLOCK',
    appliesTo: 'selenium',
    title: 'Window, tab or alert handling',
    message:
      'Window, tab or alert handling is not converted. Use Playwright popup, page or dialog events.',
  },
  {
    id: 'CORE_JS_EXECUTOR',
    level: 'BLOCK',
    appliesTo: 'selenium',
    title: 'JavaScript executor',
    message:
      'JavaScript executor calls are not converted. Use a Playwright action, or page.evaluate after review.',
  },
  {
    id: 'CORE_FILL_REPLACES_VALUE',
    level: 'INFO',
    appliesTo: 'all',
    title: 'Typing converted to fill',
    message:
      'Typing was converted to fill, which replaces the field value in one step. Use pressSequentially if the app needs key events.',
  },
  {
    id: 'CORE_XPATH',
    level: 'INFO',
    appliesTo: 'all',
    title: 'XPath kept',
    message: 'XPath locator kept. XPath does not pierce shadow DOM.',
  },
  {
    id: 'CORE_TEXT_LOCATOR',
    level: 'INFO',
    appliesTo: 'all',
    title: 'Text locator',
    message:
      'Text or link text locator converted to a text or accessible name match. Check that it matches exactly one element.',
  },
  {
    id: 'CORE_DRIVER_LIFECYCLE',
    level: 'INFO',
    appliesTo: 'selenium',
    title: 'Driver setup removed',
    message: 'WebDriver setup or teardown removed. The Playwright page fixture replaces it.',
  },
  {
    id: 'CORE_WAIT_OBJECT',
    level: 'INFO',
    appliesTo: 'selenium',
    title: 'Wait object removed',
    message:
      'WebDriverWait object removed. Playwright actions and web-first assertions wait on their own.',
  },
  {
    id: 'CORE_IMPLICIT_WAIT',
    level: 'INFO',
    appliesTo: 'selenium',
    title: 'Implicit wait removed',
    message: 'Implicit wait removed. Playwright waits for elements to be actionable.',
  },
  {
    id: 'CORE_CLICKABLE_WAIT_REMOVED',
    level: 'INFO',
    appliesTo: 'selenium',
    title: 'Clickable wait removed',
    message: 'Wait for clickable removed, because the next action waits for the same element.',
  },
  {
    id: 'CORE_STORED_ELEMENT',
    level: 'INFO',
    appliesTo: 'selenium',
    title: 'Stored element',
    message: 'Stored element became a lazy locator. It is looked up again each time it is used.',
  },
  {
    id: 'CORE_WINDOW_SIZE',
    level: 'INFO',
    appliesTo: 'selenium',
    title: 'Window size removed',
    message:
      'Window size or maximize call removed. Set the viewport in playwright.config.ts if needed.',
  },
  {
    id: 'CORE_ASSERT_MESSAGE_DROPPED',
    level: 'INFO',
    appliesTo: 'selenium',
    title: 'Assertion message dropped',
    message:
      'Assertion message dropped. Playwright prints the locator and expected value on failure.',
  },
  {
    id: 'CY_CUSTOM_COMMAND',
    level: 'BLOCK',
    appliesTo: 'cypress-js',
    title: 'Custom command',
    message:
      'Custom command cy.{name} is not converted. Port it to a helper function or a fixture.',
  },
  {
    id: 'CY_INTERCEPT',
    level: 'BLOCK',
    appliesTo: 'cypress-js',
    title: 'Network intercept',
    message:
      'cy.intercept is not converted. Rewrite it with page.route or page.waitForResponse, registered before the action that sends the request.',
  },
  {
    id: 'CY_ALIAS',
    level: 'BLOCK',
    appliesTo: 'cypress-js',
    title: 'Alias',
    message:
      "Cypress aliases (.as and cy.wait('@alias')) are not converted. Keep a variable or a page.waitForResponse promise instead.",
  },
  {
    id: 'CY_THEN',
    level: 'BLOCK',
    appliesTo: 'cypress-js',
    title: 'Callback',
    message:
      'Callbacks (.then, .each, .spread, should with a function) are not converted. Rewrite the callback with locators and expect.',
  },
  {
    id: 'CY_UNSUPPORTED_COMMAND',
    level: 'BLOCK',
    appliesTo: 'cypress-js',
    title: 'Unsupported Cypress command',
    message:
      'Cypress command .{name}() has no safe Playwright mapping in v0.1. Convert this step by hand.',
  },
  {
    id: 'CY_WITHIN',
    level: 'INFO',
    appliesTo: 'cypress-js',
    title: 'Within scope inlined',
    message: 'cy.within scope was inlined into the locator chain.',
  },
  {
    id: 'PY_MAIN_GUARD',
    level: 'INFO',
    appliesTo: 'selenium-python',
    title: 'Main guard removed',
    message: 'The if __name__ == "__main__" block was removed. Playwright Test runs the specs.',
  },
] as const satisfies readonly RuleDefinition[];

export type RuleId = (typeof RULES)[number]['id'];

const BY_ID = new Map<string, RuleDefinition>(RULES.map((r) => [r.id, r]));

export function getRule(id: RuleId): RuleDefinition {
  const rule = BY_ID.get(id);
  if (!rule) throw new Error(`Unknown rule ID: ${id}`);
  return rule;
}

export function isRuleId(id: string): id is RuleId {
  return BY_ID.has(id);
}

// Fills {placeholders} in the rule message. Throws if a placeholder has no value or a value is unused.
export function ruleMessage(id: RuleId, params: Record<string, string> = {}): string {
  const rule = getRule(id);
  const used = new Set<string>();
  const text = rule.message.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const value = params[key];
    if (value === undefined) throw new Error(`Rule ${id} needs a value for {${key}}`);
    used.add(key);
    return value;
  });
  for (const key of Object.keys(params)) {
    if (!used.has(key)) throw new Error(`Rule ${id} has no {${key}} placeholder`);
  }
  return text;
}
