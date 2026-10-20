#!/usr/bin/env python3
"""Pack data/intermediate/hillshade_xyz/{z}/{x}/{y}.png into a single PMTiles archive.

Reads the XYZ PNG tree (from build_hillshade.py) and writes
assets/tiles/hillshade.pmtiles. Does not regenerate hillshade — run
build_hillshade.py first if the PNGs are missing or stale.
"""

from __future__ import annotations

import argparse
import logging
import math
import sys
from pathlib import Path

from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

import common

log = logging.getLogger("build_hillshade_pmtiles")


def _tile_lon(z: int, x: int) -> float:
    return x / (2**z) * 360.0 - 180.0


def _tile_lat(z: int, y: int) -> float:
    n = math.pi - 2.0 * math.pi * y / (2**z)
    return math.degrees(math.atan(math.sinh(n)))


def collect_tiles(tiles_dir: Path) -> list[tuple[int, Path]]:
    """Return (tile_id, path) pairs sorted by tile_id for a clustered archive."""
    found: list[tuple[int, Path]] = []
    for path in tiles_dir.glob("*/*/*.png"):
        try:
            z = int(path.parent.parent.name)
            x = int(path.parent.name)
            y = int(path.stem)
        except ValueError:
            log.warning("Skipping non-XYZ path: %s", path)
            continue
        found.append((zxy_to_tileid(z, x, y), path))
    found.sort(key=lambda item: item[0])
    return found


def bounds_from_tiles(tiles: list[tuple[int, Path]]) -> tuple[float, float, float, float]:
    """WGS84 (west, south, east, north) covering all tiles."""
    from pmtiles.tile import tileid_to_zxy

    west = 180.0
    south = 90.0
    east = -180.0
    north = -90.0
    for tile_id, _ in tiles:
        z, x, y = tileid_to_zxy(tile_id)
        west = min(west, _tile_lon(z, x))
        east = max(east, _tile_lon(z, x + 1))
        north = max(north, _tile_lat(z, y))
        south = min(south, _tile_lat(z, y + 1))
    return west, south, east, north


def build(tiles_dir: Path, out: Path) -> int:
    if not tiles_dir.is_dir():
        raise FileNotFoundError(
            f"Hillshade XYZ folder not found: {tiles_dir} "
            "(run pipeline/build_hillshade.py first)"
        )

    tiles = collect_tiles(tiles_dir)
    if not tiles:
        raise RuntimeError(f"No PNG tiles under {tiles_dir}")

    from pmtiles.tile import tileid_to_zxy

    zooms = {tileid_to_zxy(tid)[0] for tid, _ in tiles}
    min_zoom, max_zoom = min(zooms), max(zooms)
    west, south, east, north = bounds_from_tiles(tiles)
    center_lon = (west + east) / 2.0
    center_lat = (south + north) / 2.0
    center_zoom = max(min_zoom, min(7, max_zoom))

    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(out.suffix + ".tmp")
    if tmp.exists():
        tmp.unlink()

    log.info("Packing %s tiles (z%s–%s) -> %s", len(tiles), min_zoom, max_zoom, out)
    with open(tmp, "wb") as f:
        writer = Writer(f)
        for i, (tile_id, path) in enumerate(tiles, start=1):
            writer.write_tile(tile_id, path.read_bytes())
            if i % 250 == 0 or i == len(tiles):
                log.info("  %s / %s", i, len(tiles))
        writer.finalize(
            {
                "tile_type": TileType.PNG,
                "tile_compression": Compression.NONE,
                "min_zoom": min_zoom,
                "max_zoom": max_zoom,
                "min_lon_e7": int(west * 1e7),
                "min_lat_e7": int(south * 1e7),
                "max_lon_e7": int(east * 1e7),
                "max_lat_e7": int(north * 1e7),
                "center_zoom": center_zoom,
                "center_lon_e7": int(center_lon * 1e7),
                "center_lat_e7": int(center_lat * 1e7),
            },
            {
                "name": "swiss-hillshade",
                "description": "swissALTIRegio hillshade (grayscale PNG, transparent outside CH)",
                "attribution": "© swisstopo",
                "type": "overlay",
                "format": "png",
            },
        )

    tmp.replace(out)
    size_mb = out.stat().st_size / (1024 * 1024)
    log.info("Wrote %s (%.1f MB, %s tiles)", out, size_mb, len(tiles))
    return len(tiles)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--tiles-dir",
        type=Path,
        default=common.HILLSHADE_TILES_DIR,
        help="XYZ PNG folder (default: data/intermediate/hillshade_xyz)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=common.HILLSHADE_PMTILES,
        help="Output PMTiles path (default: assets/tiles/hillshade.pmtiles)",
    )
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args(argv)
    common.setup_logging(args.log_level)
    try:
        build(args.tiles_dir, args.out)
        return 0
    except Exception:
        log.exception("build_hillshade_pmtiles failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
