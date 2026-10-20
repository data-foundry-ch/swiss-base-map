"""Shared paths and helpers for the swiss-basemap data pipeline."""

from __future__ import annotations

import logging
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

RAW_DIR = ROOT / "data" / "raw"
BOUNDARIES_DIR = RAW_DIR / "swissboundaries3d"
DEM_DIRS = (RAW_DIR / "swissaltiregio", RAW_DIR / "relief")
INTERMEDIATE_DIR = ROOT / "data" / "intermediate"

# Published static package (swiss-basemap-assets) — also Vite publicDir
ASSETS_DIR = ROOT / "assets"
WEB_BASE_DIR = ASSETS_DIR / "data" / "base"
HILLSHADE_PMTILES = ASSETS_DIR / "tiles" / "hillshade.pmtiles"

# Scratch XYZ pyramid used only to build the PMTiles archive (not published)
HILLSHADE_TILES_DIR = INTERMEDIATE_DIR / "hillshade_xyz"

# Back-compat alias
PUBLIC_DIR = ASSETS_DIR

ANALYSIS_CRS = "EPSG:2056"
WEB_CRS = "EPSG:4326"
NODATA = -9999.0

TILE_MIN_ZOOM = 5
TILE_MAX_ZOOM = 12

BOUNDARY_LAYER = "tlm_landesgebiet"
COUNTRY_ICC = "CH"


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def _first_nonempty(folders: tuple[Path, ...], pattern: str) -> Path | None:
    for folder in folders:
        if folder.is_dir():
            for candidate in sorted(folder.glob(pattern)):
                if candidate.stat().st_size > 0:
                    return candidate
    return None


def resolve_boundaries_gpkg(explicit: Path | None = None) -> Path:
    path = explicit or _first_nonempty((BOUNDARIES_DIR,), "*.gpkg")
    if path is None or not path.exists():
        raise FileNotFoundError(
            f"swissBOUNDARIES3D GeoPackage not found in {BOUNDARIES_DIR} "
            "(download from https://www.swisstopo.admin.ch/en/landscape-model-swissboundaries3d)"
        )
    return path


def resolve_dem(explicit: Path | None = None) -> Path:
    path = explicit or _first_nonempty(DEM_DIRS, "*.tif")
    if path is None or not path.exists():
        folders = ", ".join(str(d) for d in DEM_DIRS)
        raise FileNotFoundError(
            f"DEM GeoTIFF not found in {folders} "
            "(download swissALTIRegio from https://www.swisstopo.admin.ch/en/height-model-swissaltiregio)"
        )
    return path


def load_switzerland_polygon(gpkg: Path):
    """Dissolved Swiss national territory (incl. lakes, excl. Liechtenstein) in EPSG:2056, 2D."""
    import geopandas as gpd
    import shapely

    gdf = gpd.read_file(gpkg, layer=BOUNDARY_LAYER)
    gdf = gdf[gdf["icc"] == COUNTRY_ICC]
    if gdf.empty:
        raise RuntimeError(f"No '{COUNTRY_ICC}' feature in layer {BOUNDARY_LAYER} of {gpkg}")
    if gdf.crs is None or gdf.crs.to_epsg() != 2056:
        gdf = gdf.to_crs(ANALYSIS_CRS)
    geoms = [shapely.force_2d(shapely.make_valid(g)) for g in gdf.geometry]
    return shapely.union_all(geoms)
