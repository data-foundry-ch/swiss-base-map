# swiss-basemap-assets

**Version `0.0.1`** — static Swiss basemap files for MapLibre (and similar) apps.

This package is **data only**: hillshade PMTiles, lakes, rivers, national boundary,
and place labels. Pair it with your own map code (or the parent repo’s `SwissMap`
demo). Thematic layers (roads, traffic, analysis overlays) stay in the consuming
product.

## Layout

```text
swiss-basemap-assets@0.0.1/
  manifest.json
  DATA_NOTICES.md
  tiles/hillshade.pmtiles
  data/base/
    lakes.geojson
    rivers.geojson
    switzerland_boundary.geojson
    settlements.geojson
```

## Use in another project

### 1. Vendor the folder (recommended for sold / offline products)

Copy this package into your app (e.g. `public/swiss-basemap/`) and point config at it:

```ts
const ASSETS = "/swiss-basemap";

export const HILLSHADE_PMTILES = `${ASSETS}/tiles/hillshade.pmtiles`;
export const REFERENCE = {
  lakes: `${ASSETS}/data/base/lakes.geojson`,
  rivers: `${ASSETS}/data/base/rivers.geojson`,
  boundary: `${ASSETS}/data/base/switzerland_boundary.geojson`,
  settlements: `${ASSETS}/data/base/settlements.geojson`,
};
```

Register the MapLibre PMTiles protocol (`pmtiles` npm package) before adding the
raster source with `url: "pmtiles://" + absoluteUrlToHillshade`.

### 2. CDN / shared static host

Upload the package contents as-is, then set a base URL:

```ts
const ASSETS = "https://cdn.example.com/swiss-basemap-assets/0.0.1";
```

Ensure **HTTP range requests** work for `hillshade.pmtiles` (required by PMTiles).

Automated publish to Cloudflare R2 is documented in the parent repo:
[`docs/CDN.md`](../docs/CDN.md).

## Versioning

Bump `version` in `package.json` and `manifest.json` together. Prefer GitHub
Releases / CDN mirrors for distribution — the archive is ~85 MB.
