// @ts-check
const { test, expect } = require('@playwright/test');
const { autoDismissPopups, expectNoServerErrors } = require('../helpers');

/**
 * 8. Learning Journey is working as intended.
 *
 *   /learning-journey/ -> the trail map shows its books (`.lj-card`) -> open the
 *   member's current book -> its 4 stages show and the stage's activity loads
 *   -> finish that stage -> it's saved (ebo_lj_mark_stage) and marked complete.
 *
 * Finishing a stage normally means watching or playing it to the end, so the
 * test uses the page's own testing switch, eboLjTestAutoComplete() (it
 * unlocks "Next Stage"; learning-journey.js), then presses Next. The save is
 * real: each run moves the test account on by one stage. Once its whole
 * journey is done, the test still opens a book and checks it loads.
 *
 * Opening a card can take a moment: on the trail map the member's character
 * walks to the card first (learning-journey-map.js).
 */
test('The Learning Journey opens a book, and finishing a stage is saved', async ({ page }) => {
  test.setTimeout(150_000);
  await autoDismissPopups(page);

  const res = await page.goto('/learning-journey/', { waitUntil: 'domcontentloaded' });
  expect(res?.status(), 'the Learning Journey should answer 200').toBe(200);
  expect(page.url(), 'the member should stay on the Learning Journey (not be sent back to sign in)').toContain('/learning-journey');
  await expectNoServerErrors(page);

  // the map (or grid) of books
  const cards = page.locator('.lj-card');
  await expect(cards.first(), 'the Learning Journey should show its books').toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.no-books-msg:visible'), 'the Learning Journey should load (not "Failed to load")').toHaveCount(0);

  // the member's current book, else any open one, else a completed one
  const card = page.locator('.lj-card.ljm-current, .lj-card.is-open:not(.is-locked), .lj-card.is-completed').first();
  await expect(card, 'there should be a book the member can open').toBeAttached();
  const title = (await card.getAttribute('data-title')) || 'the book';
  test.info().annotations.push({ type: 'book', description: title });
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click();

  // its stages
  const view = page.locator('#lj-journey-view');
  await expect(view, `"${title}" should open`).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.lj-stage-btn'), 'the book should show its 4 stages').toHaveCount(4);

  // the stage's activity loads (a video or activity frame, or a flipbook)
  const content = page.locator('#lj-content-panel iframe#lj-active-iframe, #lj-content-panel #flipbook').first();
  await expect(content, 'the stage should load its activity').toBeVisible({ timeout: 30_000 });

  // finish the current stage, if there's one left, and check it's saved
  const active = page.locator('.lj-stage-btn.active-stage');
  const stage = (await active.count()) ? await active.first().getAttribute('data-stage') : null;
  const alreadyDone = stage ? await active.first().evaluate((b) => b.classList.contains('completed')) : true;
  if (!stage || alreadyDone) {
    test.info().annotations.push({ type: 'note', description: 'this book is already complete: checked it opens and loads' });
    return;
  }

  const hasSwitch = await page.evaluate(() => typeof window.eboLjTestAutoComplete === 'function');
  expect(hasSwitch, "the Learning Journey's testing switch (eboLjTestAutoComplete) should be available").toBe(true);
  await page.evaluate(() => window.eboLjTestAutoComplete());
  const next = page.locator('#lj-btn-next');
  await expect(next, '"Next Stage" should be usable').not.toHaveClass(/\bdisabled\b/);

  const [saved] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('admin-ajax.php') && (r.request().postData() || '').includes('ebo_lj_mark_stage'), { timeout: 20_000 }),
    next.click(),
  ]);
  const body = await saved.json().catch(() => null);
  expect(body?.success, `finishing stage ${stage} should be saved${body?.data?.message ? ` (${body.data.message})` : ''}`).toBe(true);
  await expect(page.locator(`.lj-stage-btn[data-stage="${stage}"]`), `stage ${stage} should be marked complete`).toHaveClass(/\bcompleted\b/);
});
