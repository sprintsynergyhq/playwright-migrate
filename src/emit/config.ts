// The playwright.config.ts written at the root of a converted folder.
export const PLAYWRIGHT_CONFIG_FILE = 'playwright.config.ts';

export function renderPlaywrightConfig(): string {
  return [
    "import { defineConfig, devices } from '@playwright/test';",
    '',
    '// Written by playwright-migrate. Review it before you use it in CI.',
    'export default defineConfig({',
    "  testDir: '.',",
    "  testMatch: '**/*.spec.ts',",
    '  fullyParallel: true,',
    '  forbidOnly: !!process.env.CI,',
    '  retries: 0,',
    "  reporter: 'list',",
    '  use: {',
    "    trace: 'retain-on-failure',",
    '  },',
    "  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],",
    '});',
    '',
  ].join('\n');
}
