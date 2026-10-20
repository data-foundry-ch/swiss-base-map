#!/usr/bin/env python3
"""Export the Swiss national boundary from swissBOUNDARIES3D to web GeoJSON (EPSG:4326, lon/lat)."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import common

log = logging.getLogger("build_boundary")


def _round_coords(obj, ndigits: int):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(v), ndigits) for v in obj]
        return [_round_coords(v, ndigits) for v in obj]
    return obj


def build(gpkg: Path, out: Path, simplify_m: float) -> None:
    import shapely
    from pyproj import Transformer
    from shapely.geometry import mapping
    from shapely.ops import transform

    polygon = common.load_switzerland_polygon(gpkg)
    area_km2 = polygon.area / 1e6
    if simplify_m > 0:
        polygon = shapely.simplify(polygon, simplify_m, preserve_topology=True)

    to_wgs84 = Transformer.from_crs(common.ANALYSIS_CRS, common.WEB_CRS, always_xy=True)
    geom_wgs84 = transform(to_wgs84.transform, polygon)
    geometry = mapping(geom_wgs84)
    geometry = {"type": geometry["type"], "coordinates": _round_coords(geometry["coordinates"], 6)}

    fc = {
        "type": "FeatureCollection",
        "name": "switzerland_boundary",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": 1,
                    "name": "Switzerland",
                    "area_km2": area_km2,
                    "source_dataset": "swissBOUNDARIES3D",
                    "source_file": gpkg.name,
                },
                "geometry": geometry,
            }
        ],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log.info(
        "Wrote %s (area %.1f km2, %.2f MB)",
        out,
        area_km2,
        out.stat().st_size / 1e6,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gpkg", type=Path, help="swissBOUNDARIES3D GeoPackage (default: data/raw/swissboundaries3d/*.gpkg)")
    parser.add_argument(
        "--out",
        type=Path,
        default=common.WEB_BASE_DIR / "switzerland_boundary.geojson",
    )
    parser.add_argument(
        "--simplify-m",
        type=float,
        default=0.0,
        help="Douglas-Peucker tolerance in metres (0 = full swisstopo detail)",
    )
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args(argv)
    common.setup_logging(args.log_level)
    try:
        build(common.resolve_boundaries_gpkg(args.gpkg), args.out, args.simplify_m)
        return 0
    except Exception:
        log.exception("build_boundary failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
