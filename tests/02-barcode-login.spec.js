// @ts-check
const { test, expect } = require('@playwright/test');
const { setting, autoDismissPopups, expectNoServerErrors } = require('../helpers');

/**
 * 2. Barcode login is working properly.
 *
 * From signed out: the library's page -> barcode -> "Secure Login" ->
 * member-home, signed in, showing the library's collections.
 *
 * single-library.php + library.js: the button posts ebo_loginToLibrary by AJAX
 * ("Validating...", then "Redirecting..."); a wrong barcode shows .lib__error.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('A member can sign in with their barcode', async ({ page }) => {
  await autoDismissPopups(page);
  await page.goto(setting('EBO_LIBRARY_PATH'), { waitUntil: 'domcontentloaded' });

  const barcode = page.locator('#barcode');
  await expect(barcode, 'the library page should show the barcode box').toBeVisible();
  await barcode.fill(setting('EBO_BARCODE'));
  await page.locator('#library_submit_btn').click();

  await page.waitForURL('**/member-home**', { timeout: 30_000 });
  await expect(page.locator('.lib__error:visible'), 'the barcode should be accepted').toHaveCount(0);
  await expectNoServerErrors(page);

  await expect(page.locator('a.logout-btn'), 'the member should be signed in').toBeVisible();
  await expect(page.locator('.member-home-welcome'), 'member home should welcome the library').toBeVisible();
  await expect(page.locator('.collections-row a.collection-card').first(), "member home should show the library's collections").toBeVisible();
});
