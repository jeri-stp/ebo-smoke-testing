// @ts-check
const { test: setup, expect } = require('@playwright/test');
const { setting, autoDismissPopups } = require('../helpers');

/**
 * Runs once before the smoke tests: signs in as a library member with the
 * barcode, on the library's own page, and saves the session so every test
 * starts signed in -- the way a member arrives at member-home.
 */
setup('sign in as a library member', async ({ page }) => {
  await autoDismissPopups(page);
  await page.goto(setting('EBO_LIBRARY_PATH'), { waitUntil: 'domcontentloaded' });

  const barcode = page.locator('#barcode');
  await expect(barcode, 'the library page should show the barcode box').toBeVisible();
  await barcode.fill(setting('EBO_BARCODE'));
  await page.locator('#library_submit_btn').click();

  // signing in redirects to member-home
  await page.waitForURL('**/member-home**', { timeout: 30_000 });
  await expect(page.locator('a.logout-btn'), 'the signed-in header should show').toBeVisible();

  await page.context().storageState({ path: '.auth/member.json' });
});
