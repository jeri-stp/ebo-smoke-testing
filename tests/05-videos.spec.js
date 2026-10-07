// @ts-check
const { test, expect } = require('@playwright/test');
const { setting, autoDismissPopups, vimeoState, startVimeo } = require('../helpers');

/**
 * 5. Videos are displaying properly.
 *
 * A read-along (video) book shows a Vimeo player in `.aiovg-player`
 * (single-book.php). It doesn't autoplay: it should start paused, play when
 * clicked (startVimeo: the player, then Vimeo's own Play button if the first
 * click lands too early), and keep moving forward.
 */
test('A video book plays when clicked', async ({ page }) => {
  await autoDismissPopups(page);
  await page.goto(setting('EBO_VIDEO_BOOK_PATH'), { waitUntil: 'domcontentloaded' });

  const player = page.locator('.aiovg-player iframe');
  await expect(player, 'the video player should show on the book page').toBeVisible();
  await expect(player, 'the player should be a Vimeo video').toHaveAttribute('src', /player\.vimeo\.com\/video\//);

  await expect
    .poll(async () => (await vimeoState(page))?.paused, { message: 'the video should load, paused (no autoplay)', timeout: 30_000 })
    .toBe(true);

  await startVimeo(page, 'the video');
});
