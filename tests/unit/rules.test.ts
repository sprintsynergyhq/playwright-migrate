import { describe, expect, it } from 'vitest';
import { getRule, isRuleId, RULES, ruleMessage } from '../../src/core/rules.js';

describe('rule catalog', () => {
  it('has unique IDs in UPPER_SNAKE_CASE with a known prefix', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^(CORE|CY|PY|JAVA)_[A-Z]+(_[A-Z]+)*$/);
  });

  it('writes every message as plain sentences without dashes', () => {
    for (const r of RULES) {
      expect(r.message).toMatch(/\.$/);
      expect(r.message).not.toMatch(/[\u2013\u2014]/);
      expect(r.title).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it('fills placeholders', () => {
    expect(ruleMessage('CY_CUSTOM_COMMAND', { name: 'login' })).toBe(
      'Custom command cy.login is not converted. Port it to a helper function or a fixture.',
    );
    expect(ruleMessage('CY_UNSUPPORTED_COMMAND', { name: 'its' })).toBe(
      'Cypress command .its() has no safe Playwright mapping in v0.1. Convert this step by hand.',
    );
  });

  it('throws on a missing or unused placeholder value', () => {
    expect(() => ruleMessage('CY_CUSTOM_COMMAND')).toThrow(/needs a value for \{name\}/);
    expect(() => ruleMessage('CORE_XPATH', { name: 'x' })).toThrow(/no \{name\} placeholder/);
  });

  it('looks up rules by ID', () => {
    expect(getRule('CORE_FIXED_WAIT').level).toBe('WARN');
    expect(getRule('CORE_FRAME').level).toBe('BLOCK');
    expect(getRule('CORE_FILL_REPLACES_VALUE').level).toBe('INFO');
    expect(isRuleId('CORE_FRAME')).toBe(true);
    expect(isRuleId('NOT_A_RULE')).toBe(false);
  });
});
