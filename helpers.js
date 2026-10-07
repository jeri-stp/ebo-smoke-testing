// @ts-check
const { expect } = require('@playwright/test');

/**
 * Shared bits for the smoke tests.
 */

/** A required setting from .env.local; fails the test with a clear message if blank. */
function setting(name, fallback) {
  const v = (process.env[name] ?? '').trim() || fallback;
  if (!v) throw new Error(`${name} is not set. Add it to .env.local (see .env.example).`);
  return v;
}

/** Strings that only appear when PHP/WordPress is erroring. */
const ERROR_SIGNATURES = [
  'Fatal error',
  'Parse error',
  'There has been a critical error',
  'Error establishing a database connection',
  'Notice: Undefined',
  'Warning: Undefined',
  'Warning: Trying to access',
  'Uncaught Error',
];

/**
 * Assert the page shows no PHP/WordPress error output.
 * @param {import('@playwright/test').Page} page
 */
async function expectNoServerErrors(page) {
  const html = await page.content();
  const found = ERROR_SIGNATURES.filter((s) => html.includes(s));
  expect(found, `the page should show no PHP or WordPress errors${found.length ? ` (found: ${found.join(', ')} on ${page.url()})` : ''}`).toEqual([]);
}

/** Overlays the tests open on purpose (main.js / book.js / playlist.js), never auto-closed. */
const OWN_OVERLAYS = ':not(.quiz):not(.tool):not(.learning-dashboard):not(.end-playlist):not(.marc)';

/**
 * Keep EBO's popups out of the way. Call once at the start of a test.
 *
 * - Before every page loads, mark the cookie bar, the announcement bar and the
 *   trial welcome popup as already seen (main.js remembers each in
 *   localStorage), so they never appear.
 * - Anything else that pops up and blocks a click (the staff announcement, the
 *   staff feedback popup: `.embed__overlay` with an `.embed__close` X) is
 *   closed automatically. Overlays the tests open on purpose are left alone.
 * @param {import('@playwright/test').Page} page
 */
async function autoDismissPopups(page) {
  const barcodes = [process.env.EBO_BARCODE].filter(Boolean).map((b) => String(b).toUpperCase());
  await page.addInitScript((seen) => {
    try {
      localStorage.setItem('cookiePolicy', '1');
      localStorage.setItem('announcementDismissed', '1');
      localStorage.setItem('trialPopupShown', JSON.stringify(seen));
    } catch (_) {
      /* storage blocked: the popups just get closed below instead */
    }
  }, barcodes);

  await page.addLocatorHandler(
    page.locator(`.embed__overlay:visible${OWN_OVERLAYS}`),
    async () => {
      // never throw from here: a rejection aborts the whole run
      try {
        const close = page.locator(`.embed__overlay:visible${OWN_OVERLAYS} .embed__close`);
        const n = await close.count().catch(() => 0);
        for (let i = 0; i < n; i++) await close.nth(i).click({ force: true }).catch(() => {});
        if (n === 0) await page.keyboard.press('Escape').catch(() => {});
      } catch (_) {
        /* an undismissable popup must not fail the run */
      }
    },
    { noWaitAfter: true }
  );
}

/**
 * The Vimeo player's state in `.aiovg-player`, read through the Vimeo SDK the
 * page loads. null until the iframe and SDK are ready, so callers can poll.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{paused: boolean, time: number, duration: number} | null>}
 */
function vimeoState(page) {
  return page.evaluate(async () => {
    const iframe = document.querySelector('.aiovg-player iframe');
    // @ts-ignore
    if (!iframe || !window.Vimeo) return null;
    try {
      // @ts-ignore
      const p = new window.Vimeo.Player(iframe);
      await p.ready();
      return { paused: await p.getPaused(), time: await p.getCurrentTime(), duration: await p.getDuration() };
    } catch (_) {
      return null;
    }
  });
}

/**
 * Assert the Vimeo player is genuinely playing: not paused, and its time moves
 * forward (a stuck "playing" state still fails). A video can buffer for a few
 * seconds first, and on GitHub's machines it can crawl while it buffers, so it
 * gets up to 30s and only has to move, not keep up with real time.
 * @param {import('@playwright/test').Page} page
 * @param {string} what  for messages, e.g. "the video"
 */
async function expectVimeoPlaying(page, what) {
  await expect
    .poll(async () => (await vimeoState(page))?.paused, { message: `${what} should be playing`, timeout: 20_000 })
    .toBe(false);
  const start = (await vimeoState(page))?.time ?? 0;
  let now = start;
  await expect
    .poll(async () => (now = (await vimeoState(page))?.time ?? start), {
      message: `${what} should move forward (from ${start.toFixed(2)}s)`,
      timeout: 30_000,
    })
    .toBeGreaterThan(start + 0.1);
}

/**
 * Start the Vimeo player the way a visitor does, then assert it really plays.
 *
 * Accepts the cookie banner first (it sits along the bottom of the page and
 * can cover the player). If the video is already running (the page autoplays
 * some), nothing is clicked: a click would pause it. Otherwise it clicks the
 * player, then up to twice more Vimeo's own Play button. "Running" means the
 * time moves: Vimeo can report "not paused" while sitting at 0:00 (a click
 * that landed while the page was still swapping the player in), so the
 * paused flag alone can't be trusted.
 * @param {import('@playwright/test').Page} page
 * @param {string} what  for messages, e.g. "the video"
 */
async function startVimeo(page, what) {
  await page.locator('#accept-cookie:visible').first().click({ timeout: 3_000 }).catch(() => {});

  const player = page.locator('.aiovg-player iframe');
  await player.scrollIntoViewIfNeeded();
  const play = page.frameLocator('.aiovg-player iframe').locator('button[aria-label^="Play" i], button.play').first();

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isMoving(page, attempt === 0 ? 3_000 : 10_000)) break;
    if (attempt === 0) await player.click().catch(() => {});
    else await play.click({ timeout: 5_000 }).catch(() => {});
  }

  await expectVimeoPlaying(page, what);
}

/** True if the Vimeo player's time moves forward within `ms`. */
async function isMoving(page, ms) {
  const start = (await vimeoState(page))?.time ?? 0;
  return expect
    .poll(async () => (await vimeoState(page))?.time ?? start, { timeout: ms })
    .toBeGreaterThan(start + 0.1)
    .then(() => true, () => false);
}

/** The WordPress post ID of the open page (from its body class `postid-123`). */
async function postId(page) {
  const cls = (await page.locator('body').getAttribute('class')) || '';
  const m = cls.match(/\bpostid-(\d+)\b/);
  return m ? Number(m[1]) : null;
}

module.exports = { setting, expectNoServerErrors, autoDismissPopups, vimeoState, expectVimeoPlaying, startVimeo, postId };
