// @ts-check
const { test, expect } = require('@playwright/test');
const { setting } = require('../helpers');

/**
 * 11. Mobile app endpoints are returning data.
 *
 * The app reads JSON from /endpoints/{name}/ (single-endpoint.php). Each must
 * answer 200 with JSON that has real data: not an { "error": ... } reply, not
 * empty. They chain, the way the app uses them, so no IDs need setting up:
 *
 *   all-libraries            -> the test library (by its address) and its profile
 *   profile-collections      -> that profile's collections -> the test collection
 *   collection-books         -> its books -> a book id
 *   collection-groupings     -> its groups
 *   book-details             -> that book
 *   playlist-mobile          -> the collection's playlists -> a playlist id
 *   playlist-books-mobile    -> that playlist's videos
 *   mobile-app-version
 *
 * Endpoints that write (logins, activity, comments, Learning Journey progress)
 * are left out.
 */

/** Real data: a non-empty list, or an object without "error" that holds something. */
function hasData(body) {
  if (Array.isArray(body)) return body.length > 0;
  if (!body || typeof body !== 'object') return false;
  if ('error' in body) return false;
  return Object.values(body).some((v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : v !== '' && v !== null && v !== false));
}

const slugOf = (path) => String(path).replace(/^\/+|\/+$/g, '').split('/').pop();

// the app calls these without a website session
test.use({ storageState: { cookies: [], origins: [] } });

test('Mobile app endpoints return data', async ({ request }) => {
  /** @type {string[]} */
  const problems = [];
  let checked = 0;

  /** GET an endpoint; note a problem and return null if it isn't real data. */
  async function get(path) {
    checked++;
    const res = await request.get(path).catch(() => null);
    if (!res) return problems.push(`${path}: no answer`), null;
    if (!res.ok()) return problems.push(`${path}: answered ${res.status()}`), null;
    let body;
    try { body = await res.json(); } catch { return problems.push(`${path}: not JSON`), null; }
    if (!hasData(body)) return problems.push(`${path}: no data (${JSON.stringify(body).slice(0, 120)})`), null;
    return body;
  }

  await get('/endpoints/mobile-app-version/');

  const libraries = await get('/endpoints/all-libraries/');
  const libSlug = slugOf(setting('EBO_LIBRARY_PATH'));
  // "link" is the library's full address, e.g. https://www.erabooksonline.com/au-demo/
  const library = Array.isArray(libraries) ? libraries.find((l) => l && l.link && slugOf(new URL(l.link, 'https://x').pathname) === libSlug) : null;
  if (libraries && !library) problems.push(`/endpoints/all-libraries/: the "${libSlug}" library isn't listed`);

  const profile = library?.library_profile;
  const collections = profile ? await get(`/endpoints/profile-collections/?profile=${encodeURIComponent(profile)}`) : null;
  const colSlug = slugOf(setting('EBO_COLLECTION_PATH'));
  const collection = Array.isArray(collections) ? collections.find((c) => c && c.slug === colSlug) || collections[0] : null;

  if (collection) {
    const books = await get(`/endpoints/collection-books/?collection=${encodeURIComponent(collection.slug)}`);
    await get(`/endpoints/collection-groupings/?collection=${encodeURIComponent(collection.slug)}`);
    const bookId = Array.isArray(books) ? books.find((b) => b && b.id)?.id : null;
    if (bookId) await get(`/endpoints/book-details/?bookId=${bookId}`);
    else if (books) problems.push('/endpoints/collection-books/: no book ids to follow');

    const playlists = await get(`/endpoints/playlist-mobile/?collectionId=${collection.id}`);
    const playlistId = Array.isArray(playlists) ? playlists.find((p) => p && p.playlist_id)?.playlist_id : null;
    if (playlistId) await get(`/endpoints/playlist-books-mobile/?playlistId=${playlistId}`);
  } else if (collections) {
    problems.push('/endpoints/profile-collections/: no collections to follow');
  }

  expect(problems, `all ${checked} endpoints should return data${problems.length ? `; ${problems.length} didn't:\n  ${problems.join('\n  ')}` : ''}`).toEqual([]);
});
