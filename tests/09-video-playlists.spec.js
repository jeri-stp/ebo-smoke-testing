// @ts-check
const { test, expect } = require('@playwright/test');
const { setting, autoDismissPopups, vimeoState, expectVimeoPlaying, startVimeo } = require('../helpers');

/**
 * 9. Video playlists autoplay, and the next video works.
 *
 *   play the first video -> jump to 5 seconds before it ends -> when it ends,
 *   the "Next video in 5..." countdown shows -> the next video loads and starts
 *   playing by itself.
 *
 * single-playlist.php + playlist.js: on 'ended' the countdown overlay shows,
 * then the next video loads and plays. The title (#js-native-title) and the
 * highlighted row (.playlist-row.active-video) follow the current video. The
 * jump uses the Vimeo player's own controls (its API) rather than clicking its
 * progress bar inside Vimeo's frame.
 */
test('A playlist autoplays the next video when one ends', async ({ page }) => {
  test.setTimeout(150_000); // two videos to load and buffer
  await autoDismissPopups(page);
  await page.goto(setting('EBO_PLAYLIST_PATH'), { waitUntil: 'domcontentloaded' });

  const player = page.locator('.aiovg-player iframe');
  await expect(player, 'the playlist player should show').toBeVisible();
  await expect
    .poll(async () => (await vimeoState(page)) !== null, { message: 'the player should load', timeout: 30_000 })
    .toBe(true);
  expect(await page.locator('.playlist-row').count(), 'the playlist needs at least 2 videos').toBeGreaterThanOrEqual(2);

  const title = page.locator('#js-native-title');
  const firstTitle = (await title.textContent())?.trim() || '';

  // 1. play the first video (the page tries to autoplay it; a click is the fallback)
  if ((await vimeoState(page))?.paused) await startVimeo(page, 'the first video');
  else await expectVimeoPlaying(page, 'the first video');

  // 2. jump to 5 seconds before the end, so it finishes quickly
  await page.evaluate(async () => {
    // @ts-ignore
    const p = new window.Vimeo.Player(document.querySelector('.aiovg-player iframe'));
    await p.setCurrentTime(Math.max(0, (await p.getDuration()) - 5));
    // don't wait on play(): the video ends within seconds and the page swaps
    // this player out, so its promise may never settle
    p.play().catch(() => {});
  });

  // 3. it ends: the countdown shows, then the next video loads and plays by itself
  await expect(page.locator('.countdown-overlay'), 'the "Next video in..." countdown should show when the video ends').toBeVisible({ timeout: 25_000 });
  await expect(title, 'the next video should load after the countdown').not.toHaveText(firstTitle, { timeout: 20_000 });
  await expect(page.locator('.playlist-row.active-video'), 'the playlist should highlight the new video').toHaveCount(1);
  await expectVimeoPlaying(page, 'the next video (autoplayed)');
});
