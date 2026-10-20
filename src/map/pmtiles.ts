import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

let registered = false;

/** Register the MapLibre `pmtiles://` protocol once per page load. */
export function registerPmtilesProtocol(): void {
  if (registered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  registered = true;
}

/**
 * Build a `pmtiles://…` source URL from a site-relative path or absolute http(s) URL.
 * CDN example: `https://cdn.example.com/swiss-basemap/v1/hillshade.pmtiles`
 */
export function toPmtilesSourceUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("pmtiles://")) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return `pmtiles://${pathOrUrl}`;
  const absolute = new URL(pathOrUrl, window.location.href).href;
  return `pmtiles://${absolute}`;
}
