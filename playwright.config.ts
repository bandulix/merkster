import { defineConfig, devices } from '@playwright/test';

/** E2E against a running Merkster server (local `npm start` or the Docker stack with the mock profile).
 *  Needs the mock OIDC provider (tools/mock-oidc.mjs) and the mock LLM (tools/mock-llm.mjs).
 *  E2E_BASE_URL defaults to http://localhost:8080. CHROME_PATH lets you use a system Chrome. */
const exe = process.env.CHROME_PATH;
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: exe ? { executablePath: exe } : {},
    serviceWorkers: 'allow'
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'] } }]
});
