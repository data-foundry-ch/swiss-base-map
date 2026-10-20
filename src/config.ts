/** Map defaults and static asset paths for the Swiss basemap.

 * Paths are rooted at the `swiss-basemap-assets` package (Vite `publicDir: "assets"`).
 * For another host/CDN, set `VITE_SWISS_ASSETS_BASE` (no trailing slash), e.g.
 * `https://cdn.example.com/swiss-basemap-assets/0.0.1`.
 */

const ASSETS_BASE = (import.meta.env.VITE_SWISS_ASSETS_BASE ?? "").replace(/\/$/, "");

function asset(path: string): string {
  return ASSETS_BASE ? `${ASSETS_BASE}${path}` : path;
}

export const MAP_INITIAL_CENTER: [number, number] = [8.2, 46.8];
export const MAP_INITIAL_ZOOM = 7;
export const MAP_MIN_ZOOM = 2;
export const MAP_MAX_ZOOM = 12;

export const BASEMAP_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/** Single-file hillshade archive from swiss-basemap-assets. */
export const HILLSHADE_PMTILES = asset("/tiles/hillshade.pmtiles");

export const REFERENCE = {
  boundary: asset("/data/base/switzerland_boundary.geojson"),
  settlements: asset("/data/base/settlements.geojson"),
  lakes: asset("/data/base/lakes.geojson"),
  rivers: asset("/data/base/rivers.geojson"),
} as const;

export type LayerId = "hillshade" | "lakes" | "rivers" | "boundary" | "settlements";

export type LayerVisibility = Record<LayerId, boolean>;

export const DEFAULT_LAYERS: LayerVisibility = {
  hillshade: true,
  lakes: true,
  rivers: true,
  boundary: true,
  settlements: true,
};
