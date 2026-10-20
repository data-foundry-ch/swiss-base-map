import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { HILLSHADE_PMTILES, REFERENCE } from "../config";
import { normalizeGeoJson } from "../lib/geojsonFix";
import {
  HILLSHADE_LAYER_OPACITY,
  LAKE_FILL_COLOR,
  LAKE_FILL_OPACITY,
  LAKE_OUTLINE_COLOR,
  LAKE_OUTLINE_OPACITY,
  LAKE_OUTLINE_WIDTH,
  NATIONAL_SETTLEMENT_NAMES,
  REF_BOUNDARY_COLOR,
  REF_BOUNDARY_OPACITY,
  RIVER_COLOR,
  RIVER_OPACITY,
  SETTLEMENT_LABEL_COLOR,
  SETTLEMENT_LABEL_HALO,
  SETTLEMENT_LABEL_SIZE,
  SETTLEMENT_RANK_MINZOOM,
  SWISS_THEMATIC_MIN_ZOOM,
} from "./layerStyle";
import { toPmtilesSourceUrl } from "./pmtiles";

export const HILLSHADE_SOURCE = "swiss-hillshade";
export const HILLSHADE_LAYER = "swiss-hillshade-layer";
export const LAKES_SOURCE = "swiss-lakes";
export const LAKES_FILL_LAYER = "swiss-lakes-fill";
export const LAKES_OUTLINE_LAYER = "swiss-lakes-outline";
export const RIVERS_SOURCE = "swiss-rivers";
export const RIVERS_LAYER = "swiss-rivers-line";
export const BOUNDARY_SOURCE = "ref-boundary";
export const BOUNDARY_LINE_LAYER = "ref-boundary-line";
export const SETTLEMENTS_SOURCE = "ref-settlements";

const FONT_STACK = ["Noto Sans Regular", "Open Sans Italic", "Arial Unicode MS Regular"];

export function settlementLabelLayers(map: Map): string[] {
  return (map.getStyle().layers ?? [])
    .map((layer) => layer.id)
    .filter((id) => id.startsWith("ref-settlement-"));
}

export function moveSettlementLabelsToTop(map: Map): void {
  for (const id of settlementLabelLayers(map)) {
    if (map.getLayer(id)) {
      map.moveLayer(id);
    }
  }
}

/** swissALTIRegio hillshade — PMTiles raster archive (grayscale PNG, transparent outside CH). */
export function addHillshadeLayer(map: Map, pmtilesUrl: string = HILLSHADE_PMTILES): void {
  if (map.getSource(HILLSHADE_SOURCE)) return;
  map.addSource(HILLSHADE_SOURCE, {
    type: "raster",
    url: toPmtilesSourceUrl(pmtilesUrl),
    tileSize: 256,
  });
  map.addLayer({
    id: HILLSHADE_LAYER,
    type: "raster",
    source: HILLSHADE_SOURCE,
    minzoom: SWISS_THEMATIC_MIN_ZOOM,
    paint: {
      "raster-opacity": HILLSHADE_LAYER_OPACITY,
      "raster-fade-duration": 0,
    },
  });
}

export async function loadSwissBoundary(
  map: Map,
  url: string = REFERENCE.boundary,
): Promise<void> {
  const boundaryResp = await fetch(url);
  if (!boundaryResp.ok) return;
  const boundary = normalizeGeoJson((await boundaryResp.json()) as FeatureCollection);
  if (map.getSource(BOUNDARY_SOURCE)) {
    (map.getSource(BOUNDARY_SOURCE) as GeoJSONSource).setData(boundary);
  } else {
    map.addSource(BOUNDARY_SOURCE, { type: "geojson", data: boundary });
  }
}

export function addBoundaryLineLayer(map: Map): void {
  if (map.getLayer(BOUNDARY_LINE_LAYER) || !map.getSource(BOUNDARY_SOURCE)) return;
  const before = settlementLabelLayers(map)[0];
  map.addLayer(
    {
      id: BOUNDARY_LINE_LAYER,
      type: "line",
      source: BOUNDARY_SOURCE,
      minzoom: 4,
      paint: {
        "line-color": REF_BOUNDARY_COLOR,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          1.0,
          8,
          1.15,
          12,
          1.35,
        ],
        "line-opacity": REF_BOUNDARY_OPACITY,
      },
    },
    before,
  );
}

function settlementLabelTextSize(
  baseSize: number,
  minZoom: number,
): ExpressionSpecification {
  const peakZoom = Math.min(minZoom + 2, 9);
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    minZoom,
    baseSize * 0.88,
    peakZoom,
    baseSize,
    10,
    baseSize * 0.78,
    14,
    baseSize * 0.65,
  ];
}

function addSymbolLayer(
  map: Map,
  opts: {
    id: string;
    source: string;
    filter: FilterSpecification;
    minzoom: number;
    maxzoom?: number;
    size: number;
    color: string;
    haloColor: string;
    haloWidth: number;
    letterSpacing?: number;
    priority?: number;
  },
): void {
  const minZ = opts.minzoom;
  map.addLayer({
    id: opts.id,
    type: "symbol",
    source: opts.source,
    minzoom: opts.minzoom,
    ...(opts.maxzoom != null ? { maxzoom: opts.maxzoom } : {}),
    filter: opts.filter,
    layout: {
      "text-field": ["get", "name"],
      "text-font": FONT_STACK,
      "text-size": settlementLabelTextSize(opts.size, minZ),
      "text-letter-spacing": opts.letterSpacing ?? 0.02,
      "text-padding": ["interpolate", ["linear"], ["zoom"], 9, 4, 10, 6, 14, 8],
      "text-max-width": 10,
      "text-allow-overlap": false,
      "text-ignore-placement": false,
      "text-optional": true,
      "symbol-sort-key": opts.priority ?? 0,
    },
    paint: {
      "text-color": opts.color,
      "text-halo-color": opts.haloColor,
      "text-halo-width": opts.haloWidth,
      "text-halo-blur": 0.15,
    },
  });
}

export function addSettlementLabelLayers(map: Map, data: FeatureCollection): void {
  if (!map.getSource(SETTLEMENTS_SOURCE)) {
    map.addSource(SETTLEMENTS_SOURCE, { type: "geojson", data });
  } else {
    (map.getSource(SETTLEMENTS_SOURCE) as GeoJSONSource).setData(data);
  }
  if (map.getLayer("ref-settlement-national")) return;

  addSymbolLayer(map, {
    id: "ref-settlement-national",
    source: SETTLEMENTS_SOURCE,
    minzoom: SETTLEMENT_RANK_MINZOOM.major,
    maxzoom: SETTLEMENT_RANK_MINZOOM.rank1,
    size: SETTLEMENT_LABEL_SIZE.major,
    color: SETTLEMENT_LABEL_COLOR,
    haloColor: SETTLEMENT_LABEL_HALO,
    haloWidth: 1.4,
    priority: 100,
    filter: [
      "in",
      ["get", "name"],
      ["literal", [...NATIONAL_SETTLEMENT_NAMES, "Genf"]],
    ] as FilterSpecification,
  });

  for (const { rank, minzoom, maxzoom, size, priority } of [
    { rank: 1, minzoom: SETTLEMENT_RANK_MINZOOM.rank1, size: SETTLEMENT_LABEL_SIZE.secondary, priority: 80 },
    { rank: 2, minzoom: SETTLEMENT_RANK_MINZOOM.rank2, size: SETTLEMENT_LABEL_SIZE.town, priority: 60 },
    { rank: 3, minzoom: SETTLEMENT_RANK_MINZOOM.rank3, maxzoom: 12, size: SETTLEMENT_LABEL_SIZE.small, priority: 40 },
    { rank: 4, minzoom: SETTLEMENT_RANK_MINZOOM.rank4, maxzoom: 11, size: SETTLEMENT_LABEL_SIZE.village, priority: 20 },
    { rank: 5, minzoom: SETTLEMENT_RANK_MINZOOM.rank5, maxzoom: 10, size: SETTLEMENT_LABEL_SIZE.village, priority: 10 },
  ]) {
    addSymbolLayer(map, {
      id: `ref-settlement-rank-${rank}`,
      source: SETTLEMENTS_SOURCE,
      minzoom,
      maxzoom,
      size,
      color: SETTLEMENT_LABEL_COLOR,
      haloColor: SETTLEMENT_LABEL_HALO,
      haloWidth: 1.2,
      priority,
      filter: ["==", ["get", "importance_rank"], rank] as FilterSpecification,
    });
  }
  moveSettlementLabelsToTop(map);
}

/** Standing-water polygons from swissTLM3D (via swiss-lakes processed export). */
export function addLakeLayers(map: Map, data: FeatureCollection): void {
  if (map.getSource(LAKES_SOURCE)) {
    (map.getSource(LAKES_SOURCE) as GeoJSONSource).setData(data);
  } else {
    map.addSource(LAKES_SOURCE, { type: "geojson", data });
  }
  if (!map.getLayer(LAKES_FILL_LAYER)) {
    map.addLayer({
      id: LAKES_FILL_LAYER,
      type: "fill",
      source: LAKES_SOURCE,
      minzoom: SWISS_THEMATIC_MIN_ZOOM,
      paint: {
        "fill-color": LAKE_FILL_COLOR,
        "fill-opacity": LAKE_FILL_OPACITY,
      },
    });
  }
  if (!map.getLayer(LAKES_OUTLINE_LAYER)) {
    map.addLayer({
      id: LAKES_OUTLINE_LAYER,
      type: "line",
      source: LAKES_SOURCE,
      minzoom: SWISS_THEMATIC_MIN_ZOOM,
      paint: {
        "line-color": LAKE_OUTLINE_COLOR,
        "line-width": LAKE_OUTLINE_WIDTH,
        "line-opacity": LAKE_OUTLINE_OPACITY,
      },
    });
  }
}

/** Surface flowing water from swissTLM3D — zoom-filtered by length_m. */
export function addRiverLayers(map: Map, data: FeatureCollection): void {
  if (map.getSource(RIVERS_SOURCE)) {
    (map.getSource(RIVERS_SOURCE) as GeoJSONSource).setData(data);
  } else {
    map.addSource(RIVERS_SOURCE, { type: "geojson", data });
  }
  if (map.getLayer(RIVERS_LAYER)) return;
  map.addLayer({
    id: RIVERS_LAYER,
    type: "line",
    source: RIVERS_SOURCE,
    minzoom: SWISS_THEMATIC_MIN_ZOOM,
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": RIVER_COLOR,
      "line-opacity": RIVER_OPACITY,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        ["interpolate", ["linear"], ["get", "length_m"], 2000, 0.4, 20000, 1.1, 80000, 1.8],
        9,
        ["interpolate", ["linear"], ["get", "length_m"], 500, 0.55, 5000, 1.3, 40000, 2.2],
        12,
        ["interpolate", ["linear"], ["get", "length_m"], 500, 0.8, 5000, 1.8, 40000, 2.8],
      ],
    },
    filter: [
      "step",
      ["zoom"],
      [">=", ["get", "length_m"], 8000],
      7,
      [">=", ["get", "length_m"], 3000],
      9,
      [">=", ["get", "length_m"], 1000],
      11,
      true,
    ],
  });
}

export async function loadSwissLakes(map: Map, url: string = REFERENCE.lakes): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) {
    console.warn("Lakes layer missing:", url, resp.status);
    return;
  }
  const data = normalizeGeoJson((await resp.json()) as FeatureCollection);
  addLakeLayers(map, data);
}

export async function loadSwissRivers(map: Map, url: string = REFERENCE.rivers): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) {
    console.warn("Rivers layer missing:", url, resp.status);
    return;
  }
  const data = normalizeGeoJson((await resp.json()) as FeatureCollection);
  addRiverLayers(map, data);
}

export async function loadSwissLabelLayers(
  map: Map,
  url: string = REFERENCE.settlements,
): Promise<void> {
  const settlementsResp = await fetch(url, { cache: "no-cache" });
  if (!settlementsResp.ok) {
    console.warn("Settlement labels: failed to load", url, settlementsResp.status);
    return;
  }
  const data = normalizeGeoJson((await settlementsResp.json()) as FeatureCollection);
  if (!data.features.length) {
    console.warn("Settlement labels: empty GeoJSON at", url);
    return;
  }
  addSettlementLabelLayers(map, data);
}
