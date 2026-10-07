// @ts-check
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

// Settings (site address, barcode, staff login, which books to use...) come from
// .env.local -- copy .env.example to .env.local and fill it in. On GitHub
// Actions the same names are repository secrets, so a missing file is fine.
try {
  require('dotenv').config({ path: path.join(__dirname, '.env.local') });
} catch (_) {
  /* dotenv not installed: rely on real environment variables */
}

/**
 * ERA Books Online smoke tests. A "setup" step signs in once with the library barcode
 * and saves the session (.auth/member.json); every test then starts already
 * signed in, as a library member would be. The Staff Access test signs in with
 * its own staff username and password instead.
 */
module.exports = defineConfig({
  testDir: './tests',
  // real logins, Vimeo players and PDF renders: allow headroom
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // one test at a time: they share one member session on the server
  fullyParallel: false,
  workers: 1,
  // retry once on CI to absorb a network blip, never twice
  retries: process.env.CI ? 1 : 0,
  // list in the terminal, the HTML report, and results/latest.json (a finding
  // for each step of each check)
  reporter: [['list'], ['html', { open: 'never' }], ['./reporters/results-json.js']],
  use: {
    ...devices['Desktop Chrome'],
    // real Google Chrome for everything (sign-in included), not Playwright's
    // bundled Chromium: Chromium has no H.264 decoder, so Vimeo "plays" but
    // never moves past 0:00 -- and CI installs only Chrome
    channel: 'chrome',
    baseURL: process.env.EBO_BASE_URL || 'https://erabooksonline.com',
    headless: true,
    // keep evidence only when something fails
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.js/ },
    {
      name: 'smoke',
      dependencies: ['setup'],
      use: { storageState: '.auth/member.json' },
    },
  ],
});
