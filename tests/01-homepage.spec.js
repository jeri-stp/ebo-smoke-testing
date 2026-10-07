// @ts-check
const { test, expect } = require('@playwright/test');
const { autoDismissPopups, expectNoServerErrors } = require('../helpers');

/**
 * 1. Homepage is loading properly.
 *
 * Opened as a visitor (not signed in): the page answers 200, shows no PHP or
 * WordPress errors, none of the site's own CSS/JS/fonts/images fail to load,
 * the header is there, and the library search finishes loading its list of
 * libraries (home.js fetches it by AJAX: until then the box is readonly and
 * shows "Loading...").
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('Homepage loads properly', async ({ page, baseURL }) => {
  await autoDismissPopups(page);
  const host = new URL(/** @type {string} */ (baseURL)).host.replace(/^www\./, '');
  /** @type {string[]} */
  const broken = [];
  page.on('response', (res) => {
    let h;
    try { h = new URL(res.url()).host.replace(/^www\./, ''); } catch { return; }
    if (h !== host) return; // only the site's own files
    if (!['stylesheet', 'script', 'font', 'image'].includes(res.request().resourceType())) return;
    if (res.status() >= 400) broken.push(`${res.status()} ${res.request().resourceType()} ${res.url()}`);
  });

  const res = await page.goto('/', { waitUntil: 'load' });
  expect(res?.status(), 'the homepage should answer 200').toBe(200);
  await expectNoServerErrors(page);

  await expect(page.locator('header.ebo-masthead'), 'the header should show').toBeVisible();
  const search = page.locator('#lib-search');
  await expect(search, 'the library search should show').toBeVisible();
  await expect(search, 'the library search should finish loading the libraries').toBeEditable({ timeout: 30_000 });
  expect(await page.locator('#lib-list li').count(), 'the library search should have libraries to find').toBeGreaterThan(0);

  expect(broken, `all of the homepage's own files should load${broken.length ? `; these failed:\n  ${broken.join('\n  ')}` : ''}`).toEqual([]);
});
