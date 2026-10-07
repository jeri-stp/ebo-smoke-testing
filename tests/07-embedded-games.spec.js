// @ts-check
const { test, expect } = require('@playwright/test');
const { setting, autoDismissPopups, expectNoServerErrors } = require('../helpers');

/**
 * 7. Embedded games are displaying properly.
 *
 * An embedded (game) book drops its game's iframe into `.embedded-wrapper`
 * (single-book.php; the games live under /games/ on erabooksonline.com). The
 * game is showing when: the iframe is on screen at a real size, its address is
 * secure (https, or the browser blocks it), the game page loads (200), and the
 * game draws something inside the frame.
 */
test('An embedded game displays', async ({ page, context }) => {
  await autoDismissPopups(page);
  await page.goto(setting('EBO_GAME_BOOK_PATH'), { waitUntil: 'domcontentloaded' });
  await expectNoServerErrors(page);

  const frame = page.locator('.embedded-wrapper iframe').first();
  await expect(frame, 'the game should show on the book page').toBeVisible();
  const box = await frame.boundingBox();
  expect(box?.height ?? 0, 'the game should have a real height').toBeGreaterThan(200);
  expect(box?.width ?? 0, 'the game should have a real width').toBeGreaterThan(200);

  const src = (await frame.getAttribute('src')) || '';
  expect(src, 'the game should load over https').toMatch(/^https:\/\//);
  const res = await context.request.get(src).catch(() => null);
  expect(res?.status(), `the game page should load (${src})`).toBe(200);

  // the game draws something inside its frame. Games are built differently
  // (canvas, images, or plain divs: 3D Dice is CSS-styled divs), so count any
  // visible element that actually paints: media, a background, or text.
  const body = page.frameLocator('.embedded-wrapper iframe').first().locator('body');
  await expect
    .poll(
      () =>
        body.evaluate((b) => {
          const painted = Array.from(b.querySelectorAll('*')).filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 20 || r.height < 20) return false;
            if (el.matches('canvas, img, svg, video, iframe, button')) return true;
            const s = getComputedStyle(el);
            if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false;
            const bg = s.backgroundColor;
            return s.backgroundImage !== 'none' || (bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg));
          });
          return painted.length + ((b.innerText || '').trim().length > 20 ? 1 : 0);
        }).catch(() => 0),
      { message: 'the game should draw something inside its frame', timeout: 30_000 }
    )
    .toBeGreaterThan(0);
});
