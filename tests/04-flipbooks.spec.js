// @ts-check
const { test, expect } = require('@playwright/test');
const { setting, autoDismissPopups } = require('../helpers');

/**
 * 4. Flipbooks are displaying properly.
 *
 * Same pipeline as LOTE4Kids (single-book.php + book.js): pdf.js draws each PDF
 * page to a canvas, turn.js turns `#flipbook` into a book, then the loader
 * hides and the controls show (`.flipbook-controls.show`). The test waits for
 * that, then presses Next three times and checks the page moves forward.
 */

/** turn.js's current page, or null until the flipbook has finished building. */
function currentPage(page) {
  return page.evaluate(() => {
    // @ts-ignore
    const $ = window.jQuery;
    const el = $ && $('#flipbook');
    if (!el || !el.length) return null;
    try {
      const p = el.turn('page');
      return typeof p === 'number' ? p : null;
    } catch (_) {
      return null;
    }
  });
}

test('A flipbook displays and turns its pages', async ({ page }) => {
  await autoDismissPopups(page);
  await page.goto(setting('EBO_FLIPBOOK_BOOK_PATH'), { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#flipbook'), 'the flipbook should show on the book page').toBeVisible();
  await expect
    .poll(() => currentPage(page), { message: 'the flipbook should finish building', timeout: 45_000 })
    .not.toBeNull();
  await expect(page.locator('.flipbook-controls.show'), 'the flipbook controls should show once it is ready').toBeVisible();
  expect(await page.locator('#flipbook canvas').count(), 'the flipbook should have drawn its pages').toBeGreaterThan(0);

  const next = page.locator('#flipbook-btn-next');
  let prev = /** @type {number} */ (await currentPage(page));
  for (let i = 1; i <= 3; i++) {
    await next.click();
    await page.waitForTimeout(1_000); // the turn animation
    const now = /** @type {number} */ (await currentPage(page));
    expect(now, `Next ${i}: the page should move forward (was ${prev}, now ${now})`).toBeGreaterThan(prev);
    prev = now;
  }
  await expect(page.locator('#flipbook-btn-prev'), 'Previous should be usable after turning forward').not.toHaveClass(/\bdisabled\b/);
});
