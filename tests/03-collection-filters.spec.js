// @ts-check
const { test, expect } = require('@playwright/test');
const { setting, autoDismissPopups, expectNoServerErrors } = require('../helpers');

/**
 * 3. Single collection page & filters work.
 *
 * The collection page lists its books (`.book-item`), grouped. Its filter bar
 * (single-collection.php + collection.js) narrows them by hiding the rest
 * (inline display:none; nothing is marked active):
 *   - search: keyup, matches the book title
 *   - category: a dropdown of the collection's groups (when the collection has it on)
 *   - tags: a dropdown (when the collection has it on)
 *   - "Reset Filters" shows everything again
 */

const visibleBooks = (page) => page.locator('.book-item:visible');
const options = (select) => select.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.getAttribute('value') || '', label: (o.textContent || '').trim() })).filter((o) => o.value));

test('A collection lists its books, and its filters work', async ({ page }) => {
  await autoDismissPopups(page);
  const res = await page.goto(setting('EBO_COLLECTION_PATH'), { waitUntil: 'domcontentloaded' });
  expect(res?.status(), 'the collection page should answer 200').toBe(200);
  expect(page.url(), 'the member should stay on the collection (not be sent back to sign in)').toContain('/collections/');
  await expectNoServerErrors(page);

  await expect(visibleBooks(page).first(), 'the collection should list books').toBeVisible();
  const total = await visibleBooks(page).count();

  const bar = page.locator('.filter');
  await expect(bar, 'the collection should have its filter bar').toBeVisible();

  // search: type part of a book's title -> only matching books stay
  const titles = await page.locator('.book-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-title') || '').filter(Boolean));
  const word = (titles.find((t) => /[a-z]{4,}/i.test(t)) || titles[0] || '').match(/[a-z]{4,}/i)?.[0] || '';
  expect(word, 'the books should have titles to search for').not.toBe('');
  const search = bar.locator('.search input');
  await search.pressSequentially(word, { delay: 40 });
  await expect.poll(() => visibleBooks(page).count(), { message: `searching "${word}" should narrow the books` }).toBeLessThanOrEqual(total);
  const shown = await visibleBooks(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-title') || ''));
  expect(shown.length, `searching "${word}" should find books`).toBeGreaterThan(0);
  expect(shown.filter((t) => !t.toLowerCase().includes(word.toLowerCase())), `every book shown should match "${word}"`).toEqual([]);

  // reset shows everything again
  await bar.locator('a.filter-reset').click();
  await expect.poll(() => visibleBooks(page).count(), { message: '"Reset Filters" should show every book again' }).toBe(total);

  // category and tag dropdowns, when the collection has them
  for (const [id, kind] of [['#filter-category-select', 'category'], ['#filter-tags-select', 'tag']]) {
    const select = page.locator(id);
    if (!(await select.isVisible().catch(() => false))) continue;
    for (const o of await options(select)) {
      await select.selectOption(o.value);
      await expect.poll(() => visibleBooks(page).count(), { message: `${kind} "${o.label}" should show books` }).toBeGreaterThan(0);
    }
    await bar.locator('a.filter-reset').click();
    await expect.poll(() => visibleBooks(page).count(), { message: `"Reset Filters" should undo the ${kind} filter` }).toBe(total);
  }
});
