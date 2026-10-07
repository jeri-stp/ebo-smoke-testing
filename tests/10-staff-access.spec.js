// @ts-check
const { test, expect } = require('@playwright/test');
const { setting, autoDismissPopups, expectNoServerErrors } = require('../helpers');

/**
 * 10. Staff Access login & usage reports are working.
 *
 *   /staff-access/ -> staff username + password -> the library's dashboard
 *   (/{library}/dashboard) -> the usage report finishes loading -> "Export"
 *   becomes usable.
 *
 * The form is #staff-loginform (log / pwd), a normal post. The dashboard
 * (single-library.php) loads the report in a frame; when it has loaded, the
 * spinner (#report-loading) hides and the export button stops being disabled.
 * When the report is Studio-built (/endpoints/staff-usage-report/, same site)
 * its content is checked too. Starts signed out: staff sign in on their own.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('Staff can sign in and see the usage report', async ({ page }) => {
  await autoDismissPopups(page);
  await page.goto('/staff-access/', { waitUntil: 'domcontentloaded' });

  const form = page.locator('#staff-loginform');
  await expect(form, 'the staff login form should show').toBeVisible();
  await form.locator('input[name="log"]').fill(setting('EBO_STAFF_USERNAME'));
  await form.locator('input[name="pwd"]').fill(setting('EBO_STAFF_PASSWORD'));
  await form.locator('input[type="submit"]').click();

  await page.waitForURL('**/dashboard**', { timeout: 30_000 });
  await expect(page.locator('p.error-msg:visible'), 'the staff login should be accepted').toHaveCount(0);
  await expectNoServerErrors(page);

  await expect(page.locator('#report-loading'), 'the usage report should finish loading').toBeHidden({ timeout: 60_000 });
  await expect(page.locator('.report__wrap iframe').first(), 'the usage report should show').toBeVisible();
  await expect(page.locator('#export-pdf-report-btn'), 'exporting the report should become available').not.toHaveClass(/\bis-disabled\b/);

  // the site's own report: check it really has a report in it
  if ((await page.locator('#new-dashboard-report-iframe').count()) > 0) {
    const report = page.frameLocator('#new-dashboard-report-iframe');
    await expect(report.locator('body'), 'the usage report should not be refused').not.toContainText(/Unauthorized access|Access Denied/i);
    await expect(report.locator('table.kpi-table'), 'the usage report should show its key figures').toBeVisible({ timeout: 30_000 });
  }
});
