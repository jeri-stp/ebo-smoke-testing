// @ts-check
const { test, expect } = require('@playwright/test');
const { setting, autoDismissPopups } = require('../helpers');

/**
 * 6. Activities are linking out properly.
 *
 * A book's sidebar (template-parts/section-sidebar-book.php) links out to its
 * Related Activities (`a.activities__btn`: PDFs, or game pages) and its
 * Learning Guide (`a.guide__btn`), each in a new tab. For every one: clicking
 * it opens a new tab, and what it points to really loads (200, a PDF or page,
 * not empty), fetched with the member's own session.
 */
test('Every activity and guide on a book opens', async ({ page, context }) => {
  await autoDismissPopups(page);
  await page.goto(setting('EBO_ACTIVITY_BOOK_PATH'), { waitUntil: 'domcontentloaded' });

  const links = page.locator('.sidebar a.activities__btn, .sidebar a.guide__btn');
  await expect(links.first(), 'the book should list activities (set EBO_ACTIVITY_BOOK_PATH to a book that has some)').toBeVisible();
  const n = await links.count();

  /** @type {string[]} */
  const broken = [];
  for (let i = 0; i < n; i++) {
    const link = links.nth(i);
    const href = new URL((await link.getAttribute('href')) || '', page.url()).toString();

    // it opens in a new tab
    await link.scrollIntoViewIfNeeded();
    const [tab] = await Promise.all([context.waitForEvent('page', { timeout: 20_000 }), link.click()]);
    await tab.close().catch(() => {});

    // and what it points to is really there
    const res = await context.request.get(href).catch(() => null);
    const type = res?.headers()['content-type'] || '';
    const size = res ? (await res.body()).length : 0;
    if (!res || !res.ok()) broken.push(`${res ? res.status() : 'no answer'} ${href}`);
    else if (!/pdf|html/i.test(type)) broken.push(`unexpected type "${type}" ${href}`);
    else if (size < 1000) broken.push(`empty (${size} bytes) ${href}`);
  }

  expect(broken, `all ${n} activities and guides should open${broken.length ? `; ${broken.length} didn't:\n  ${broken.join('\n  ')}` : ''}`).toEqual([]);
});
