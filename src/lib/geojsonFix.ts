/**
 * GeoJSON must use [longitude, latitude]. Some DuckDB exports may swap axes —
 * detect and fix for Switzerland.
 */

import type {
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

function fixPosition(coord: Position): Position {
  const [a, b] = coord;
  if (a == null || b == null) return coord;
  // Switzerland-ish: lat 45–48, lon 5–11
  if (a >= 45 && a <= 48.5 && b >= 5 && b <= 11.5) {
    return [b, a];
  }
  return [a, b];
}

function fixRing(ring: Position[]): Position[] {
  return ring.map(fixPosition);
}

export function fixGeometry(geometry: Geometry): Geometry {
  if (geometry.type === "Point") {
    return geometry;
  }
  if (geometry.type === "Polygon") {
    const coords = (geometry as Polygon).coordinates.map(fixRing);
    return { type: "Polygon", coordinates: coords };
  }
  if (geometry.type === "MultiPolygon") {
    const coords = (geometry as MultiPolygon).coordinates.map((poly) =>
      poly.map(fixRing),
    );
    return { type: "MultiPolygon", coordinates: coords };
  }
  return geometry;
}

export function normalizeGeoJson(fc: FeatureCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fc.features.map((feature) => ({
      ...feature,
      geometry: feature.geometry ? fixGeometry(feature.geometry) : feature.geometry,
    })),
  };
}
