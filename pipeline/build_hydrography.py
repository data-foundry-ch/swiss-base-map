#!/usr/bin/env python3
"""Build basemap hydrography GeoJSON from the sibling swiss-lakes / swissTLM3D sources.

Lakes: reuse the processed polygons from ../swiss-lakes (swissTLM3D standing water).
Rivers: extract surface flowing-water lines from swissTLM3D in that repo, filter and
simplify for national basemap scales, export WGS84 GeoJSON.

Outputs:
  assets/data/base/lakes.geojson
  assets/data/base/rivers.geojson
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import common

log = logging.getLogger("build_hydrography")

SIBLING_LAKES_ROOT = common.ROOT.parent / "swiss-lakes"
DEFAULT_LAKES_SRC = SIBLING_LAKES_ROOT / "data" / "processed" / "lakes.geojson"
DEFAULT_TLM = (
    SIBLING_LAKES_ROOT
    / "data"
    / "raw"
    / "swisstlm3d"
    / "swisstlm3d_2026-02-24_2056_5728.gpkg"
)
FLOW_LAYER = "tlm_gewaesser_fliessgewaesser"

# Keep rivers useful at national → regional zoom without shipping every ditch.
DEFAULT_MIN_RIVER_LENGTH_M = 500.0
DEFAULT_RIVER_SIMPLIFY_M = 25.0
DEFAULT_MIN_LAKE_AREA_M2 = 10_000.0  # 1 ha — drops tiny ponds from the basemap pack


def _round_coords(obj, ndigits: int = 5):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(v), ndigits) for v in obj]
        return [_round_coords(v, ndigits) for v in obj]
    return obj


def _fix_lonlat_coords(coords):
    """DuckDB exports may be [lat, lon]; GeoJSON needs [lon, lat]."""
    if not coords:
        return coords
    if isinstance(coords[0], (int, float)):
        a, b = float(coords[0]), float(coords[1])
        if 45.0 <= a <= 48.5 and 5.0 <= b <= 11.5:
            return [b, a]
        return [a, b]
    return [_fix_lonlat_coords(c) for c in coords]


def _fix_geometry(geom: dict) -> dict:
    gtype = geom.get("type")
    if gtype in ("Point", "LineString"):
        return {**geom, "coordinates": _fix_lonlat_coords(geom["coordinates"])}
    if gtype == "Polygon":
        return {
            **geom,
            "coordinates": [_fix_lonlat_coords(ring) for ring in geom["coordinates"]],
        }
    if gtype == "MultiPolygon":
        return {
            **geom,
            "coordinates": [
                [_fix_lonlat_coords(ring) for ring in poly] for poly in geom["coordinates"]
            ],
        }
    if gtype == "MultiLineString":
        return {
            **geom,
            "coordinates": [_fix_lonlat_coords(line) for line in geom["coordinates"]],
        }
    return geom


def build_lakes(src: Path, out: Path, min_area_m2: float) -> int:
    raw = json.loads(src.read_text(encoding="utf-8"))
    features = []
    for i, feat in enumerate(raw.get("features", []), start=1):
        props = dict(feat.get("properties") or {})
        area = float(props.get("area_m2") or 0.0)
        if area < min_area_m2:
            continue
        geom = feat.get("geometry")
        if not geom:
            continue
        geom = _fix_geometry(geom)
        geom = {
            "type": geom["type"],
            "coordinates": _round_coords(geom["coordinates"], 5),
        }
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "lake_id": props.get("lake_id", i),
                    "name": props.get("name"),
                    "area_m2": round(area, 1),
                    "is_reservoir": bool(props.get("is_reservoir")),
                },
                "geometry": geom,
            }
        )

    fc = {
        "type": "FeatureCollection",
        "name": "swiss_lakes",
        "features": features,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log.info(
        "Lakes: %s features (min_area %.0f m2) → %s (%.2f MB)",
        len(features),
        min_area_m2,
        out,
        out.stat().st_size / 1e6,
    )
    return len(features)


def build_rivers(
    tlm: Path,
    out: Path,
    min_length_m: float,
    simplify_m: float,
) -> int:
    import geopandas as gpd
    import shapely
    from pyproj import Transformer
    from shapely.geometry import mapping
    from shapely.ops import transform

    if not tlm.exists():
        raise FileNotFoundError(
            f"swissTLM3D GeoPackage not found: {tlm}\n"
            "Expected the sibling swiss-lakes raw extract."
        )

    log.info("Reading %s / %s …", tlm.name, FLOW_LAYER)
    gdf = gpd.read_file(
        tlm,
        layer=FLOW_LAYER,
        where="objektart = 'Fliessgewaesser' AND verlauf = 'Oberirdisch'",
    )
    if gdf.empty:
        raise RuntimeError("No surface flowing-water features matched the filter")
    if gdf.crs is None:
        gdf = gdf.set_crs(common.ANALYSIS_CRS)
    elif gdf.crs.to_epsg() != 2056:
        gdf = gdf.to_crs(common.ANALYSIS_CRS)

    gdf["geometry"] = gdf.geometry.map(shapely.force_2d)
    gdf["length_m"] = gdf.geometry.length
    gdf = gdf[gdf["length_m"] >= min_length_m].copy()
    log.info("After length filter (>= %.0f m): %s segments", min_length_m, len(gdf))

    if simplify_m > 0:
        gdf["geometry"] = gdf.geometry.simplify(simplify_m, preserve_topology=True)

    # Dissolve by watercourse id when present, else keep segments.
    dissolve_key = "gwl_nr" if "gwl_nr" in gdf.columns else None
    if dissolve_key:
        gdf[dissolve_key] = gdf[dissolve_key].fillna("").astype(str)
        named = (
            gdf.sort_values("length_m", ascending=False)
            .groupby(dissolve_key, dropna=False)["name"]
            .agg(lambda s: next((v for v in s if isinstance(v, str) and v.strip()), None))
        )
        dissolved = gdf.dissolve(by=dissolve_key, aggfunc={"length_m": "sum"})
        dissolved = dissolved.reset_index()
        dissolved["name"] = dissolved[dissolve_key].map(named)
        dissolved["length_m"] = dissolved.geometry.length
        gdf = dissolved
        log.info("After dissolve by %s: %s features", dissolve_key, len(gdf))

    gdf = gdf[gdf["length_m"] >= min_length_m].copy()
    to_wgs84 = Transformer.from_crs(common.ANALYSIS_CRS, common.WEB_CRS, always_xy=True)

    features = []
    for i, row in enumerate(gdf.itertuples(index=False), start=1):
        geom = getattr(row, "geometry")
        if geom is None or geom.is_empty:
            continue
        geom_wgs = transform(to_wgs84.transform, geom)
        geometry = mapping(geom_wgs)
        geometry = {
            "type": geometry["type"],
            "coordinates": _round_coords(geometry["coordinates"], 5),
        }
        name = getattr(row, "name", None)
        if isinstance(name, float):  # pandas NA
            name = None
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "river_id": i,
                    "name": name if isinstance(name, str) and name.strip() else None,
                    "gwl_nr": getattr(row, dissolve_key, None) if dissolve_key else None,
                    "length_m": round(float(getattr(row, "length_m", 0.0)), 1),
                },
                "geometry": geometry,
            }
        )

    fc = {
        "type": "FeatureCollection",
        "name": "swiss_rivers",
        "features": features,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log.info(
        "Rivers: %s features (min_length %.0f m) → %s (%.2f MB)",
        len(features),
        min_length_m,
        out,
        out.stat().st_size / 1e6,
    )
    return len(features)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--lakes-src", type=Path, default=DEFAULT_LAKES_SRC)
    parser.add_argument("--tlm", type=Path, default=DEFAULT_TLM)
    parser.add_argument(
        "--lakes-out",
        type=Path,
        default=common.WEB_BASE_DIR / "lakes.geojson",
    )
    parser.add_argument(
        "--rivers-out",
        type=Path,
        default=common.WEB_BASE_DIR / "rivers.geojson",
    )
    parser.add_argument("--min-lake-area-m2", type=float, default=DEFAULT_MIN_LAKE_AREA_M2)
    parser.add_argument("--min-river-length-m", type=float, default=DEFAULT_MIN_RIVER_LENGTH_M)
    parser.add_argument("--river-simplify-m", type=float, default=DEFAULT_RIVER_SIMPLIFY_M)
    parser.add_argument("--skip-lakes", action="store_true")
    parser.add_argument("--skip-rivers", action="store_true")
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args(argv)
    common.setup_logging(args.log_level)
    try:
        if not args.skip_lakes:
            if not args.lakes_src.exists():
                raise FileNotFoundError(
                    f"Processed lakes GeoJSON not found: {args.lakes_src}\n"
                    "Build it in the swiss-lakes repo first (or pass --lakes-src)."
                )
            build_lakes(args.lakes_src, args.lakes_out, args.min_lake_area_m2)
        if not args.skip_rivers:
            build_rivers(
                args.tlm,
                args.rivers_out,
                args.min_river_length_m,
                args.river_simplify_m,
            )
        return 0
    except Exception:
        log.exception("build_hydrography failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
