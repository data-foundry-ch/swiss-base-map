import type { Map } from "maplibre-gl";

/** Hide dense basemap detail; keep quiet land/ocean/country context. */
export function muteBasemap(map: Map): void {
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id.toLowerCase();
    if (layer.type === "symbol") {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
    if (layer.type === "line" && (id.includes("road") || id.includes("transport"))) {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
    if (layer.type === "fill" && id.includes("building")) {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }
}
