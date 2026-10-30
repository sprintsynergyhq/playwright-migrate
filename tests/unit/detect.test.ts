import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectPath, detectSource } from '../../src/core/detect.js';
import { REPO_ROOT, listSourceFiles } from '../golden/harness.js';

describe('detectSource', () => {
  it('labels Java that imports org.openqa.selenium as selenium-java', () => {
    const d = detectSource('LoginTest.java', 'import org.openqa.selenium.By;\nclass LoginTest {}');
    expect(d).toEqual({
      path: 'LoginTest.java',
      framework: 'selenium-java',
      reason: 'imports org.openqa.selenium',
    });
  });

  it('labels Java without a Selenium import as unknown', () => {
    const d = detectSource('Util.java', 'import java.util.List;\nclass Util {}');
    expect(d.framework).toBe('unknown');
    expect(d.reason).toBe('no supported framework detected');
  });

  it('labels Python with from selenium import webdriver as selenium-python', () => {
    const d = detectSource('test_login.py', 'from selenium import webdriver\n');
    expect(d.framework).toBe('selenium-python');
    expect(d.reason).toBe('imports selenium');
  });

  it('labels Python with import selenium as selenium-python', () => {
    const d = detectSource('test_login.py', 'import os\nimport selenium\n');
    expect(d.framework).toBe('selenium-python');
  });

  it('labels Python without Selenium as unknown', () => {
    const d = detectSource(
      'test_math.py',
      'import pytest\n\ndef test_add():\n    assert 1 + 1 == 2\n',
    );
    expect(d.framework).toBe('unknown');
    expect(d.reason).toBe('no supported framework detected');
  });

  it('labels a .cy.js file with cy.visit( as cypress-js', () => {
    const d = detectSource('login.cy.js', "cy.visit('https://www.saucedemo.com/');");
    expect(d.framework).toBe('cypress-js');
    expect(d.reason).toBe('uses cy.* commands');
  });

  it('labels a .js file without cy. as unknown', () => {
    const d = detectSource('helpers.js', 'export const add = (a, b) => a + b;');
    expect(d.framework).toBe('unknown');
    expect(d.reason).toBe('no supported framework detected');
  });

  it('labels a .ts file with cy.get( as unknown with the v1 reason', () => {
    const d = detectSource('login.cy.ts', 'cy.get(\'[data-test="username"]\');');
    expect(d.framework).toBe('unknown');
    expect(d.reason).toBe('Cypress TypeScript is not supported in v1');
  });

  it('labels a .md file as unknown', () => {
    const d = detectSource('README.md', "cy.visit('/'); import org.openqa.selenium.By;");
    expect(d.framework).toBe('unknown');
    expect(d.reason).toBe('no supported framework detected');
  });
});

describe('detectPath', () => {
  it('finds every SauceDemo source, skips expected folders and sorts by path', async () => {
    const results = await detectPath(path.join(REPO_ROOT, 'fixtures', 'saucedemo'));
    expect(results.map((r) => ({ path: r.path, framework: r.framework }))).toEqual(
      listSourceFiles(),
    );
    const paths = results.map((r) => r.path);
    expect([...paths].sort()).toEqual(paths);
    expect(paths.some((p) => p.includes('/expected/'))).toBe(false);
  });

  it('detects a single file and returns its file name', async () => {
    const file = path.join(
      REPO_ROOT,
      'fixtures',
      'saucedemo',
      'cases',
      'login-success',
      'selenium-java',
      'LoginSuccessTest.java',
    );
    const results = await detectPath(file);
    expect(results).toEqual([
      {
        path: 'LoginSuccessTest.java',
        framework: 'selenium-java',
        reason: 'imports org.openqa.selenium',
      },
    ]);
  });
});
