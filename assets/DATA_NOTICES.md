# Data notices — swiss-basemap-assets

This package redistributes **derived / processed** geographic data. The package
*code and packaging* may be used under the terms of the repository license; the
**data** remains subject to the upstream providers’ terms. Always keep attribution
visible on the map.

## Included datasets

| Asset | Upstream | Notes |
|---|---|---|
| `tiles/hillshade.pmtiles` | swisstopo swissALTIRegio | Pre-rendered relief (PNG in PMTiles), masked to CH |
| `data/base/lakes.geojson` | swisstopo swissTLM3D | Standing water (≥ 1 ha), via swiss-lakes processed export |
| `data/base/rivers.geojson` | swisstopo swissTLM3D | Surface flowing water (≥ 500 m), simplified for basemap scales |
| `data/base/switzerland_boundary.geojson` | swisstopo swissBOUNDARIES3D | National boundary |
| `data/base/settlements.geojson` | swisstopo swissNAMES3D | Place labels (pre-built) |

## Attribution (minimum)

Map data © [swisstopo](https://www.swisstopo.admin.ch).

## Your obligations

- Confirm current **swisstopo Open Government Data** / product terms for your use
  case (including commercial redistribution inside client deliverables).
- This package does **not** include a CARTO/OSM basemap style. If your app loads
  CARTO Positron (or similar), check that provider’s commercial terms or use a
  self-hosted style.

## Not included

- Roads, traffic counts, or other thematic product layers (add those per project)
- Raw swissALTIRegio DEM / swissTLM3D GeoPackage
- Intermediate XYZ PNG tile pyramids used only to build the PMTiles archive
- Application source code (demo app lives in the parent repository)
