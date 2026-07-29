import { defineConfig, devices } from '@playwright/test';

// Viewports come from docs/UX_FLOWS.md section 3 and are required by AC-25.
export default defineConfig({
  testDir: './e2e',
  reporter: [['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 834, height: 1112 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 } } },
  ],
});
