// Smoke test for the built package: loads every grammar from dist/ and parses one fixture per framework.
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { parseSource } from '../dist/parse/treeSitter.js';

const files = [
  ['cypress-js', 'fixtures/saucedemo/cases/login-success/cypress-js/login-success.cy.js'],
  [
    'selenium-python',
    'fixtures/saucedemo/cases/login-success/selenium-python/test_login_success.py',
  ],
  ['selenium-java', 'fixtures/saucedemo/cases/login-success/selenium-java/LoginSuccessTest.java'],
];
for (const [framework, path] of files) {
  const tree = await parseSource(framework, path, readFileSync(path, 'utf8'));
  console.log(`parsed ${path}: ${tree.rootNode.type}`);
  tree.delete();
}
