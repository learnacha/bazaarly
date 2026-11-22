import { defineConfig, devices } from '@playwright/test';

// UI automation. By default it starts the app itself on PORT 3100 (needs DATABASE_URL and
// BETTER_AUTH_SECRET in .env). To test a running or deployed app instead:
//   BASE_URL=https://my-app.example.com npm run e2e
const external = !!process.env.BASE_URL;
const PORT = process.env.E2E_PORT ?? '3100';
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: 'e2e-results/artifacts',
  timeout: 30_000,
  expect: { timeout: 7_500 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-results/html', open: 'never' }],
    ['junit', { outputFile: 'e2e-results/junit.xml' }],
    ['json', { outputFile: 'e2e-results/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@smoke/ },
  ],
  webServer: external ? undefined : {
    command: 'npm run build && node --env-file-if-exists=.env server/index.js --prod',
    env: { PORT, BETTER_AUTH_URL: BASE_URL },
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
