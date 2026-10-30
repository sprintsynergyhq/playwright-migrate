import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RULES } from '../../src/core/rules.js';
import {
  MAPPING_DOC,
  README_BLOCK_END,
  README_BLOCK_START,
  renderBlockRuleList,
  renderMappingReference,
  replaceReadmeBlock,
} from '../../src/docs/reference.js';
import {
  ACTIONS,
  ELEMENT_ASSERTIONS,
  TITLE_ASSERTIONS,
  URL_ASSERTIONS,
} from '../../src/sources/cypress-js/table.js';
import { BY_NAMES, KEYS, WAIT_CONDITIONS } from '../../src/sources/selenium/common.js';

const readme = readFileSync('README.md', 'utf8');
const mapping = readFileSync(MAPPING_DOC, 'utf8');
const FIX = 'Run `npm run docs:generate` and commit the result.';

describe('generated docs', () => {
  it('docs/mapping.md matches the rule catalog and the mapping tables', async () => {
    expect(mapping, FIX).toBe(await renderMappingReference());
  });

  it('the README block matches the BLOCK rules in the catalog', () => {
    expect(readme.includes(renderBlockRuleList()), FIX).toBe(true);
    expect(replaceReadmeBlock(readme)).toBe(readme);
  });

  it('the README names every BLOCK rule and no other rule', () => {
    const named = new Set(readme.match(/\b(?:CORE|CY|PY|JAVA)_[A-Z_]+\b/g) ?? []);
    for (const rule of RULES) {
      expect(named.has(rule.id), rule.id).toBe(rule.level === 'BLOCK');
    }
  });

  it('docs/mapping.md lists every rule and every table row', () => {
    const keys = [
      ...RULES.map((r) => `\`${r.id}\``),
      ...Object.keys(ACTIONS).map((k) => `.${k}(`),
      ...[ELEMENT_ASSERTIONS, URL_ASSERTIONS, TITLE_ASSERTIONS].flatMap((t) =>
        Object.keys(t).map((k) => `\`${k}\``),
      ),
      ...Object.keys(BY_NAMES).map((k) => `\`By.${k}\``),
      ...Object.keys(WAIT_CONDITIONS).map((k) => `\`${k}\``),
      ...Object.keys(KEYS).map((k) => `\`Keys.${k}\``),
    ];
    for (const key of keys) expect(mapping, key).toContain(key);
  });

  it('shows Playwright code formatted like a converted spec', () => {
    expect(mapping).toContain("`await page.locator('#element').fill('value');`");
    expect(mapping).toContain("`await page.locator('xpath=//h1').click();`");
    expect(mapping).not.toMatch(/`await [^`]*"#element"/);
  });

  it('replaceReadmeBlock needs both markers', () => {
    expect(() => replaceReadmeBlock('# Title\n')).toThrow(/block-rules markers/);
    const text = `a\n${README_BLOCK_START}\nold\n${README_BLOCK_END}\nb\n`;
    expect(replaceReadmeBlock(text)).toBe(`a\n${renderBlockRuleList()}\nb\n`);
  });

  it('the README has a Known Limits section and links the mapping reference', () => {
    expect(readme).toMatch(/^## Known Limits$/m);
    expect(readme).toContain('[docs/mapping.md](docs/mapping.md)');
  });
});
