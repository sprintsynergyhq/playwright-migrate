import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectSource } from '../../src/core/detect.js';
import { grammarUrl, parseSource, ParseError } from '../../src/parse/treeSitter.js';
import type { GrammarName } from '../../src/parse/treeSitter.js';
import type { SourceFramework } from '../../src/core/types.js';

const sha256 = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

// Every source file under fixtures/saucedemo, skipping expected/ folders.
function sourceFixtures(dir = 'fixtures/saucedemo'): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'expected') out.push(...sourceFixtures(path));
    } else if (/\.(js|py|java)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

describe('grammar files', () => {
  it.each(['javascript', 'python', 'java'] as GrammarName[])(
    'grammars/tree-sitter-%s.wasm matches the installed grammar package',
    (name) => {
      const committed = fileURLToPath(grammarUrl(name));
      const installed = `node_modules/tree-sitter-${name}/tree-sitter-${name}.wasm`;
      expect(existsSync(committed)).toBe(true);
      expect(sha256(committed)).toBe(sha256(installed));
    },
  );
});

describe('parseSource', () => {
  const files = sourceFixtures();

  it('finds the fixture sources', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files)('parses %s with no syntax errors', async (path) => {
    const text = readFileSync(path, 'utf8');
    const { framework } = detectSource(path, text);
    expect(framework).not.toBe('unknown');
    const tree = await parseSource(framework as SourceFramework, path, text);
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.type).toBe(framework === 'selenium-python' ? 'module' : 'program');
    tree.delete();
  });

  it('throws ParseError with a 1-based line for broken Java', async () => {
    const text = 'class A {\n  void b() {\n    int x = ;\n  }\n}\n';
    await expect(parseSource('selenium-java', 'A.java', text)).rejects.toThrow(ParseError);
    await expect(parseSource('selenium-java', 'A.java', text)).rejects.toThrow(/A\.java at line 3/);
  });

  it('throws ParseError for broken Python and JavaScript', async () => {
    await expect(parseSource('selenium-python', 'a.py', 'def f(:\n    pass\n')).rejects.toThrow(
      ParseError,
    );
    await expect(parseSource('cypress-js', 'a.cy.js', "it('x', () => {\n")).rejects.toThrow(
      ParseError,
    );
  });

  it('exposes the node types and fields the extractors rely on', async () => {
    const js = await parseSource('cypress-js', 'a.cy.js', "cy.get('#a').eq(-1).click();\n");
    const call = js.rootNode.namedChildren[0]?.namedChildren[0];
    expect(call?.type).toBe('call_expression');
    expect(call?.childForFieldName('function')?.type).toBe('member_expression');
    expect(call?.childForFieldName('function')?.childForFieldName('property')?.text).toBe('click');
    js.delete();

    const py = await parseSource('selenium-python', 'a.py', 'assert "a" in driver.current_url\n');
    const assertion = py.rootNode.namedChildren[0];
    expect(assertion?.type).toBe('assert_statement');
    expect(assertion?.namedChildren[0]?.type).toBe('comparison_operator');
    py.delete();

    const java = await parseSource(
      'selenium-java',
      'A.java',
      'class A { @Test void t() { driver.findElement(By.id("x")).click(); } }\n',
    );
    const method = java.rootNode.descendantsOfType('method_declaration')[0];
    expect(method?.childForFieldName('name')?.text).toBe('t');
    const invocation = java.rootNode.descendantsOfType('method_invocation')[0];
    expect(invocation?.childForFieldName('name')?.text).toBe('click');
    expect(
      java.rootNode.descendantsOfType('marker_annotation')[0]?.childForFieldName('name')?.text,
    ).toBe('Test');
    java.delete();
  });
});
