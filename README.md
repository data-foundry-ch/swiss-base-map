# swiss-basemap

Demo app and **producer** for [`swiss-basemap-assets@0.0.1`](./assets/) — a reusable
Switzerland basemap pack (hillshade PMTiles, lakes, rivers, boundary, place labels).

Built with React, Vite and MapLibre GL JS.

## Packages in this repo

| Path | Role |
|---|---|
| `assets/` | **`swiss-basemap-assets@0.0.1`** — static files future projects depend on |
| `src/` | Demo MapLibre app that consumes those assets |
| `pipeline/` | Optional rebuild scripts (boundary / hillshade / PMTiles) |

## Run the demo

```powershell
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (embeds assets/)
```

## Ship the assets package

```powershell
npm run pack:assets          # → release/swiss-basemap-assets-v0.0.1/ + .zip
```

Consumers: copy the release folder, host it on a CDN, or vendor it under
`public/swiss-basemap/`. See [`assets/README.md`](./assets/README.md).

**Cloudflare R2 CD:** create a GitHub Release whose tag matches `assets/package.json`
(e.g. `v0.0.1`). The [publish workflow](./.github/workflows/publish-assets.yml) packs
assets, syncs them to R2 under `swiss-basemap-assets/<version>/`, and attaches the
zip to the Release. Setup: [`docs/CDN.md`](./docs/CDN.md).

**New GIS app from this pack:**

```powershell
npm run new-project -- my-swiss-app --cdn https://assets.example.com/swiss-basemap-assets/0.0.1 --install
```

Creates `../my-swiss-app` with MapLibre map code + `.env` pointing at the CDN (no
local tile/geojson copies). See `scripts/new-project.mjs`.

Thematic layers (roads, traffic, deck.gl overlays, etc.) belong in each product —
not in this basemap pack.

## Layers (bottom → top)

| Layer | Source file | Origin |
|---|---|---|
| Basemap | CARTO Positron style URL (labels, roads, buildings hidden) | `src/map/basemap.ts` |
| Relief | `assets/tiles/hillshade.pmtiles` (z5–12) | swissALTIRegio → `pipeline/build_hillshade.py` → `pipeline/build_hillshade_pmtiles.py` |
| Lakes | `assets/data/base/lakes.geojson` | swissTLM3D via sibling `swiss-lakes` → `pipeline/build_hydrography.py` |
| Rivers | `assets/data/base/rivers.geojson` | swissTLM3D via sibling `swiss-lakes` → `pipeline/build_hydrography.py` |
| Swiss boundary | `assets/data/base/switzerland_boundary.geojson` | swissBOUNDARIES3D → `pipeline/build_boundary.py` |
| Place names | `assets/data/base/settlements.geojson` | swissNAMES3D (pre-built) |

Map defaults live in `src/config.ts`; colours/widths in `src/map/layerStyle.ts`.
Asset paths and attribution for other apps live in `assets/manifest.json`.

## Reusing in another app

**Assets only (recommended):** use `swiss-basemap-assets` from `assets/` or a packed
release — see [`assets/README.md`](./assets/README.md).

**Assets + map code:** copy `src/map/`, `src/lib/`, `src/config.ts` and the `assets/`
tree (or point config at a CDN). Requires `maplibre-gl` and `pmtiles`.

## Data pipeline (optional)

Only needed to regenerate the boundary or relief. Requires Python 3.12+.

```powershell
python -m pip install -r pipeline/requirements.txt

# Boundary → assets/data/base/switzerland_boundary.geojson
python pipeline/build_boundary.py

# Lakes + rivers (reads ../swiss-lakes processed lakes + raw swissTLM3D)
python pipeline/build_hydrography.py

# Relief: DEM → XYZ scratch → assets/tiles/hillshade.pmtiles
python pipeline/build_hillshade.py              # writes data/intermediate/hillshade_xyz
python pipeline/build_hillshade_pmtiles.py      # packs XYZ → assets/tiles/hillshade.pmtiles
```

Raw inputs:

- `data/raw/swissboundaries3d/` — swissBOUNDARIES3D GeoPackage (2026-01 release, **local only** — `data/raw/` is git-ignored due to file size).
- `data/raw/swissaltiregio/` — swissALTIRegio DEM (~10 GB, **not included**, git-ignored).
- Sibling [`swiss-lakes`](../swiss-lakes) — processed `lakes.geojson` + raw swissTLM3D for rivers.

Intermediates (including the XYZ PNG pyramid) stay in `data/intermediate/` and are
**not** part of `swiss-basemap-assets`.

## Attribution

See [`assets/DATA_NOTICES.md`](./assets/DATA_NOTICES.md). Map data © swisstopo ·
basemap style © CARTO / OSM (not shipped in the assets package).
