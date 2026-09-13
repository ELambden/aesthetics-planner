# Essex Aesthetics Opportunity Map

Decision-support map for identifying high-opportunity aesthetics practice locations across ceremonial Essex and Havering.

## Run Locally

```bash
npm install
npm run dev
```

The app uses the prepared real datasets in `public/data` and runs without Google credentials. Add `VITE_GOOGLE_MAPS_BROWSER_KEY` to use Google Maps and Street View locally. Use Node 22 or newer (`.nvmrc` selects Node 22). Local development binds to `127.0.0.1` and has no login.

## Data Workflow

```bash
npm run data:refresh-overture
npm run data:build-density
npm run data:build-stations
npm run data:validate
```

`data:refresh-overture` uses Overture Maps as the default competitor source and writes normalized candidates to `public/data/clinics.json`. `data:build-density` rebuilds the real LSOA/OA map assets and scores them against that competitor file. `data:score` remains available as a lighter sample-area scorer and preserves `public/data/clinics.json` when it exists.

## GitHub Pages

Follow [GITHUB_PAGES_SETUP.md](GITHUB_PAGES_SETUP.md). The public map is published manually through **Actions → Publish Pages → Run workflow**. Ordinary pushes never republish it. After use, unpublish the site and make the repository private.

- `npm run check:github` tests and builds the GitHub version in `dist-github`.
- `npm run preview:github` previews that version locally.
- The first public build uses OpenStreetMap and needs no API key. Local `.env.local` keys are not bundled.
- The source and included map data are public while the repository is public. See the guide for optional browser keys and the visibility controls.

## Optional Cloudflare Hosting

[CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) documents the alternative with Cloudflare Access email login.

- `npm run check` tests authentication, validates the real data, builds the app and compiles its Functions.
- `npm run pages:bootstrap -- --project-name lina-location-map` creates an empty deployment so Access can be configured before uploading data.
- `npm run pages:deploy -- --project-name lina-location-map` publishes the checked map after the account setup.
- Set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `OS_API_KEY` as Pages secrets. Protect production and preview hostnames and select Fail closed, as described in the guide.
- Every page, asset and data request is checked for a signed Cloudflare Access token. Missing configuration refuses access. The old shared-password flow is retired.
- The hosted app reads the same prepared data files as the local map. No database is required. Dataset changes are published by redeploying; filters and score weights are per viewer.
- API/data failures show a reload message rather than silently replacing real results with sample locations.
- Restrict the browser Google Maps key by HTTP referrer and restrict the backend Places key by API.
- Competitor-source names, addresses, coordinates, and status fields are cached with timestamps. Overture candidates currently use a 90-day refresh window; Google Places enrichment uses 30 days.

## OS + ONS Density Build

The current map uses MapLibre GL with the Ordnance Survey Vector Tile API as the basemap. Set `VITE_OS_API_KEY` in `.env.local` for local development, or `OS_API_KEY` as a Cloudflare Pages secret for hosting. Do not store the OS API secret in the app; the browser only needs the project API key.

To rebuild the real population-density overlay from the local ONS files:

```bash
npm run data:build-density
npm run data:build-stations
npm run data:validate
```

The generated files are:

- `public/data/density-overlay.geojson`: clipped Output Area polygons for Havering + ceremonial Essex, coloured by parent LSOA TS006 density score.
- `public/data/opportunity-areas.geojson`: ranked LSOA summary records used by the left-hand table and detail panel.


## Station layer and nearby clinics

Blue pins show 668 active stations within the map bounds, including 92 in the Essex/Havering study area. Use **Stations** on the map to toggle the layer, or search the Stations panel. Select a pin or shortlist entry to draw a 500 m or 1 km radius, see the nearest mapped clinic, and compare nearby clinic counts. The shortlist sorts by fewest nearby clinics. Counts use straight-line distance, include unreviewed clinic candidates, exclude rejected and permanently closed records, and are independent of the clinic display filter.

Stations outside the study area are marked **Not assessed**; those whose radius reaches its boundary carry a coverage note. Low counts are leads to investigate, not evidence of unmet demand or a complete clinic inventory. The area scoring model is unchanged.

The committed `public/data/stations.json` is a Department for Transport [NaPTAN](https://beta-naptan.dft.gov.uk/download) snapshot under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). It includes rail (National Rail, Overground and Elizabeth line), Underground and DLR access points. Nearby same-name interchanges are combined; platforms and separate entrances are not extra pins. NaPTAN's generic Rail category does not identify individual lines. Snapshot date, source IDs and a study-boundary checksum are stored with the data. No account, API key or runtime station service is needed.

Only refreshing the station snapshot requires Python and Shapely:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements-stations.txt
npm run data:refresh-stations
npm run data:validate
```

The refresh downloads the nationwide CSV into ignored `generated/naptan-stops.csv` (roughly 100 MB), then builds the small map snapshot. `npm run data:build-stations` reuses that CSV, downloading it if missing. Run it after rebuilding the density overlay: station coverage uses the actual Output Area polygons, and validation rejects an out-of-date boundary checksum. Commit the updated snapshot and publish Pages to share the refresh.

## Scoring Model

Opportunity scoring now uses three factors: population density, competitor access gap, and house-price affluence. Target-age weighting has been removed from the scoring controls because the available local age-share proxy is too shaky for decision-grade ranking.


## House-Price Affluence Metric

`npm run data:build-density` also reads `HPSSA Dataset 46 - Median price paid for residential properties by LSOA.xls`, Sheet `1a`, column `Year ending Mar 2023`.

The pipeline joins those values by `LSOA code` and uses the target-area percentile as `affluenceScore`. If an LSOA has a suppressed or missing value, the script falls back to the median for its local authority, then to the target-area median.


## Overture Competitor Layer

Run the competitor refresh from Overture Maps first:

```bash
python3 -m venv .venv
.venv/bin/pip install overturemaps
npm run data:refresh-overture
npm run data:build-density
npm run data:build-stations
npm run data:validate
```

The refresh script downloads Overture Places for the Essex/Havering bounding box as GeoJSONSeq, streams the file, and filters to likely aesthetics, skin, laser, injectables, cosmetic, dermatology, and medical-spa providers. It writes:

- `generated/overture-places.geojsonseq`: raw bounded Overture response, ignored from git.
- `public/data/clinics.json`: normalized review queue with `source`, `confidence`, `reviewStatus`, website, phone, and cache expiry.

Imported Overture candidates default to `needs_review`. Review and exclude false positives before treating competitor-access scoring as decision-grade.


## Optional Google Places Enrichment

Run the competitor refresh only when a backend Places API key is available:

```bash
GOOGLE_PLACES_API_KEY=your-key npm run data:refresh-places
npm run data:build-density
npm run data:build-stations
npm run data:validate
```

The refresh script uses Google Places Text Search across target towns and aesthetics-specific search terms. It writes:

- `generated/places-raw.json`: raw Places response cache with query metadata.
- `public/data/clinics.json`: normalized map candidates with `source`, `confidence`, `reviewStatus`, Google Maps link, website, phone, rating, and cache expiry.

Imported Places candidates default to `needs_review`. Review and exclude false positives before treating competitor-access scoring as decision-grade.
