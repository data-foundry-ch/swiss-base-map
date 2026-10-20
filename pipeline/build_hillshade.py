#!/usr/bin/env python3
"""Build the Swiss relief layer: DEM -> 50 m hillshade -> masked to CH -> Web Mercator XYZ PNG tiles.

Steps (outputs in data/intermediate/ unless noted):
  1. dem_ch_50m.tif          DEM resampled to a 50 m EPSG:2056 grid over the Swiss extent
  2. hillshade.tif           uint8 hillshade (azimuth 315°, altitude 45°)
  3. hillshade_masked.tif    float32, nodata outside the swissBOUNDARIES3D national boundary
  4. hillshade_3857.tif      reprojected to EPSG:3857
  5. hillshade_xyz/{z}/{x}/{y}.png   grayscale RGBA tiles, transparent outside CH
     (then pack with build_hillshade_pmtiles.py → assets/tiles/hillshade.pmtiles)
"""

from __future__ import annotations

import argparse
import logging
import math
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import rasterio
import rasterio.features
import rasterio.transform
import rasterio.windows
from PIL import Image
from rasterio.enums import Resampling
from rasterio.warp import calculate_default_transform, reproject
from rasterio.warp import transform as crs_transform

import common

log = logging.getLogger("build_hillshade")

TARGET_RES_M = 50.0
AZIMUTH_DEG = 315.0
ALTITUDE_DEG = 45.0
WEB_MERCATOR_HALF = 20037508.342789244


def clip_dem(dem: Path, bounds: tuple[float, float, float, float], out: Path) -> Path:
    """Resample the DEM onto a 50 m EPSG:2056 grid covering the Swiss extent."""
    xmin, ymin, xmax, ymax = bounds
    width = int(np.ceil((xmax - xmin) / TARGET_RES_M))
    height = int(np.ceil((ymax - ymin) / TARGET_RES_M))
    transform = rasterio.transform.from_origin(xmin, ymax, TARGET_RES_M, TARGET_RES_M)

    with rasterio.open(dem) as src:
        if src.crs is None:
            raise RuntimeError(f"DEM has no CRS: {dem}")
        data = np.full((height, width), np.nan, dtype="float32")
        reproject(
            source=rasterio.band(src, 1),
            destination=data,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=transform,
            dst_crs=common.ANALYSIS_CRS,
            resampling=Resampling.bilinear,
            src_nodata=src.nodata,
            dst_nodata=np.nan,
        )

    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": 1,
        "dtype": "float32",
        "crs": common.ANALYSIS_CRS,
        "transform": transform,
        "nodata": common.NODATA,
        "compress": "deflate",
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(out, "w", **profile) as dst:
        dst.write(np.where(np.isfinite(data), data, common.NODATA).astype("float32"), 1)
    log.info("Clipped DEM -> %s (%sx%s @ %.0f m)", out, width, height, TARGET_RES_M)
    return out


def hillshade_numpy(dem: Path, out: Path, *, zfactor: float = 1.0) -> Path:
    """Hillshade from the gradient in pixel units.

    Not scaled by cell size, so relief is strongly exaggerated at 50 m — that is the
    intended look of the published tiles.
    """
    with rasterio.open(dem) as src:
        data = src.read(1, masked=True).astype("float32").filled(np.nan)
        profile = {
            "driver": "GTiff",
            "height": src.height,
            "width": src.width,
            "count": 1,
            "dtype": "uint8",
            "crs": src.crs,
            "transform": src.transform,
            "compress": "deflate",
            "tiled": True,
            "blockxsize": 256,
            "blockysize": 256,
        }

    dy, dx = np.gradient(np.nan_to_num(data, nan=np.nanmean(data)) * zfactor)
    slope = np.pi / 2.0 - np.arctan(np.hypot(dx, dy))
    aspect = np.arctan2(-dx, dy)
    azimuth = np.radians(AZIMUTH_DEG)
    altitude = np.radians(ALTITUDE_DEG)
    shaded = np.sin(altitude) * np.sin(slope) + np.cos(altitude) * np.cos(slope) * np.cos(
        azimuth - aspect
    )
    shaded = np.clip(shaded * 255, 0, 255).astype("uint8")

    out.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(out, "w", **profile) as dst:
        dst.write(shaded, 1)
    log.info("Hillshade (numpy) -> %s", out)
    return out


def hillshade_gdal(dem: Path, out: Path, *, zfactor: float = 1.0) -> Path:
    """Cell-size-aware hillshade via gdaldem (softer relief than the numpy engine)."""
    exe = shutil.which("gdaldem")
    if not exe:
        raise RuntimeError("gdaldem not found on PATH — install GDAL or use --engine numpy")
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        exe, "hillshade", str(dem), str(out),
        "-z", str(zfactor),
        "-az", str(AZIMUTH_DEG),
        "-alt", str(ALTITUDE_DEG),
        "-compute_edges",
        "-co", "COMPRESS=DEFLATE",
    ]
    log.info("Running: %s", " ".join(cmd))
    subprocess.run(cmd, check=True)
    return out


def mask_to_boundary(hillshade: Path, polygon, out: Path) -> Path:
    """Set cells outside the national boundary to nodata."""
    with rasterio.open(hillshade) as src:
        data = src.read(1).astype("float32")
        outside = rasterio.features.geometry_mask(
            [polygon], out_shape=data.shape, transform=src.transform, invert=False
        )
        profile = src.profile.copy()
    data[outside] = common.NODATA
    profile.update(dtype="float32", nodata=common.NODATA, compress="deflate")
    with rasterio.open(out, "w", **profile) as dst:
        dst.write(data, 1)
    log.info("Masked to boundary -> %s (%.1f%% inside)", out, 100.0 * (~outside).mean())
    return out


def reproject_to_web_mercator(src_tif: Path, dst_tif: Path) -> Path:
    with rasterio.open(src_tif) as src:
        transform, width, height = calculate_default_transform(
            src.crs, "EPSG:3857", src.width, src.height, *src.bounds
        )
        meta = src.meta.copy()
        meta.update(crs="EPSG:3857", transform=transform, width=width, height=height, compress="deflate")
        dest = np.full((height, width), common.NODATA, dtype=src.dtypes[0])
        reproject(
            source=rasterio.band(src, 1),
            destination=dest,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=transform,
            dst_crs="EPSG:3857",
            resampling=Resampling.cubic,
            src_nodata=common.NODATA,
            dst_nodata=common.NODATA,
        )
    with rasterio.open(dst_tif, "w", **meta) as dst:
        dst.write(dest, 1)
    log.info("Reprojected -> %s", dst_tif)
    return dst_tif


def _lon_to_tile_x(lon: float, z: int) -> int:
    return int((lon + 180.0) / 360.0 * (2**z))


def _lat_to_tile_y(lat: float, z: int) -> int:
    rad = math.radians(lat)
    return int((1.0 - math.log(math.tan(rad) + 1.0 / math.cos(rad)) / math.pi) / 2.0 * (2**z))


def encode_hillshade_tile(data: np.ndarray) -> np.ndarray:
    """RGB = hillshade gray (0–255), A = 255 inside CH, 0 outside."""
    valid = data != common.NODATA
    gray = np.where(valid, np.clip(data, 0, 255), 0).astype(np.uint8)
    alpha = np.where(valid, 255, 0).astype(np.uint8)
    return np.stack([gray, gray, gray, alpha], axis=-1)


def export_xyz_tiles(src_tif: Path, tiles_dir: Path, *, min_zoom: int, max_zoom: int) -> int:
    if tiles_dir.exists():
        shutil.rmtree(tiles_dir)
    tiles_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    with rasterio.open(src_tif) as src:
        minx, miny, maxx, maxy = src.bounds
        lons, lats = crs_transform("EPSG:3857", "EPSG:4326", [minx, maxx], [miny, maxy])
        for z in range(min_zoom, max_zoom + 1):
            n = 2**z
            x0 = max(0, _lon_to_tile_x(min(lons), z) - 1)
            x1 = min(n - 1, _lon_to_tile_x(max(lons), z) + 1)
            y0 = max(0, _lat_to_tile_y(max(lats), z) - 1)
            y1 = min(n - 1, _lat_to_tile_y(min(lats), z) + 1)
            count = 0
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    tile_minx = x / n * WEB_MERCATOR_HALF * 2 - WEB_MERCATOR_HALF
                    tile_maxx = (x + 1) / n * WEB_MERCATOR_HALF * 2 - WEB_MERCATOR_HALF
                    tile_maxy = WEB_MERCATOR_HALF - y / n * WEB_MERCATOR_HALF * 2
                    tile_miny = WEB_MERCATOR_HALF - (y + 1) / n * WEB_MERCATOR_HALF * 2
                    window = rasterio.windows.from_bounds(
                        tile_minx, tile_miny, tile_maxx, tile_maxy, transform=src.transform
                    )
                    data = src.read(
                        1,
                        window=window,
                        out_shape=(256, 256),
                        resampling=Resampling.cubic,
                        boundless=True,
                        fill_value=common.NODATA,
                    )
                    rgba = encode_hillshade_tile(data)
                    if rgba[..., 3].max() == 0:
                        continue
                    xdir = tiles_dir / str(z) / str(x)
                    xdir.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(rgba, mode="RGBA").save(xdir / f"{y}.png", optimize=True)
                    count += 1
            total += count
            log.info("Tiles z=%s: %s", z, count)
    return total


def build(args: argparse.Namespace) -> None:
    gpkg = common.resolve_boundaries_gpkg(args.gpkg)
    dem = common.resolve_dem(args.dem)
    work = args.work_dir
    work.mkdir(parents=True, exist_ok=True)

    log.info("Boundary: %s", gpkg)
    log.info("DEM: %s", dem)
    polygon = common.load_switzerland_polygon(gpkg)

    dem_clip = clip_dem(dem, polygon.bounds, work / "dem_ch_50m.tif")
    hillshade = work / "hillshade.tif"
    if args.engine == "gdal":
        hillshade_gdal(dem_clip, hillshade, zfactor=args.zfactor)
    else:
        hillshade_numpy(dem_clip, hillshade, zfactor=args.zfactor)
    masked = mask_to_boundary(hillshade, polygon, work / "hillshade_masked.tif")
    mercator = reproject_to_web_mercator(masked, work / "hillshade_3857.tif")

    if args.skip_tiles:
        return
    n = export_xyz_tiles(mercator, args.out_dir, min_zoom=args.min_zoom, max_zoom=args.max_zoom)
    log.info("Wrote %s tiles to %s", n, args.out_dir)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--dem", type=Path, help="DEM GeoTIFF (default: data/raw/swissaltiregio/*.tif)")
    parser.add_argument("--gpkg", type=Path, help="swissBOUNDARIES3D GeoPackage (default: data/raw/swissboundaries3d/*.gpkg)")
    parser.add_argument("--out-dir", type=Path, default=common.HILLSHADE_TILES_DIR, help="XYZ tile output folder (replaced)")
    parser.add_argument("--work-dir", type=Path, default=common.INTERMEDIATE_DIR)
    parser.add_argument("--engine", choices=("numpy", "gdal"), default="numpy",
                        help="numpy = matches the published tiles; gdal = softer, cell-size-aware relief")
    parser.add_argument("--zfactor", type=float, default=1.0)
    parser.add_argument("--min-zoom", type=int, default=common.TILE_MIN_ZOOM)
    parser.add_argument("--max-zoom", type=int, default=common.TILE_MAX_ZOOM)
    parser.add_argument("--skip-tiles", action="store_true", help="Stop after hillshade_3857.tif")
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args(argv)
    common.setup_logging(args.log_level)
    try:
        build(args)
        return 0
    except Exception:
        log.exception("build_hillshade failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
