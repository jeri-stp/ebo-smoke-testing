# ERA Books Online smoke testing

Playwright checks for the 11 things on erabooksonline.com that must always work:

| # | Check | Test |
|---|---|---|
| 1 | Homepage is loading properly | `01-homepage` |
| 2 | Barcode login is working properly | `02-barcode-login` |
| 3 | Single collection page & filters work | `03-collection-filters` |
| 4 | Flipbooks are displaying properly | `04-flipbooks` |
| 5 | Videos are displaying properly | `05-videos` |
| 6 | Activities are linking out properly | `06-activities` |
| 7 | Embedded games are displaying properly | `07-embedded-games` |
| 8 | Learning Journey is working as intended | `08-learning-journey` |
| 9 | Video playlists autoplay and next video works | `09-video-playlists` |
| 10 | Staff Access login & usage reports are working | `10-staff-access` |
| 11 | Mobile app endpoints are returning data | `11-mobile-endpoints` |

A setup step signs in once with the library barcode; every member check then
starts signed in. Staff Access signs in with its own username and password.
Tests run in Google Chrome (Vimeo's videos need its H.264 decoder).

## Setup

```
npm install
npx playwright install chrome
cp .env.example .env.local      # then fill in the barcode and staff login
```

`.env.local` holds the site address, barcode, staff username/password and which
collection, books and playlist to use. It is never committed.

## Run

```
npm test                                  # all checks
npm run test:headed                       # watch them in a browser
npx playwright test tests/05-videos.spec.js   # just one
npm run report                            # open the last report
```

## Good to know

- **Real activity:** signing in and opening books are logged like a real
  member's visits. Use a test barcode, not a customer's.
- **Learning Journey:** each run completes one stage for the test account
  (using the page's own testing switch, `eboLjTestAutoComplete()`), so the
  account moves through its journey over time. Once it's all done, the check
  still opens a book and checks it loads.
- **Mobile endpoints** chain the way the app uses them (library → profile →
  collections → books, groups, playlists), so no IDs need setting up.

## Results (JSON)

Every run is written to `results/latest.json` (and `results/runs/<run id>.json`),
with a finding for each step of each check. On GitHub Actions the run is also
sent to Storytime Studio (Platform Settings → Automations) when the
`STUDIO_RESULTS_SECRET` secret is set.

## On GitHub Actions

`.github/workflows/smoke-tests.yml` runs every day at 6am Sydney time, and on
demand (**Actions → ERA Books Online smoke tests → Run workflow**). It needs the
secrets `EBO_BARCODE`, `EBO_STAFF_USERNAME`, `EBO_STAFF_PASSWORD`, plus
`STUDIO_RESULTS_SECRET` to report to Studio. Every other setting has a default
in the workflow; override one with a repository **variable** of the same name.
