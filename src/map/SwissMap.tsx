import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BASEMAP_STYLE_URL,
  MAP_INITIAL_CENTER,
  MAP_INITIAL_ZOOM,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  type LayerVisibility,
} from "../config";
import { muteBasemap } from "./basemap";
import { registerPmtilesProtocol } from "./pmtiles";
import {
  addBoundaryLineLayer,
  addHillshadeLayer,
  BOUNDARY_LINE_LAYER,
  HILLSHADE_LAYER,
  LAKES_FILL_LAYER,
  LAKES_OUTLINE_LAYER,
  loadSwissBoundary,
  loadSwissLabelLayers,
  loadSwissLakes,
  loadSwissRivers,
  moveSettlementLabelsToTop,
  RIVERS_LAYER,
  settlementLabelLayers,
} from "./referenceLayers";

type Props = {
  layers: LayerVisibility;
};

function setVisibility(map: Map, layerId: string, visible: boolean): void {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

function applyLayerVisibility(map: Map, layers: LayerVisibility): void {
  setVisibility(map, HILLSHADE_LAYER, layers.hillshade);
  setVisibility(map, LAKES_FILL_LAYER, layers.lakes);
  setVisibility(map, LAKES_OUTLINE_LAYER, layers.lakes);
  setVisibility(map, RIVERS_LAYER, layers.rivers);
  setVisibility(map, BOUNDARY_LINE_LAYER, layers.boundary);
  for (const id of settlementLabelLayers(map)) {
    setVisibility(map, id, layers.settlements);
  }
}

/** Stack: basemap → hillshade → lakes → rivers → boundary → labels. */
function orderReferenceLayers(map: Map): void {
  if (map.getLayer(LAKES_FILL_LAYER) && map.getLayer(HILLSHADE_LAYER)) {
    map.moveLayer(LAKES_FILL_LAYER);
  }
  if (map.getLayer(LAKES_OUTLINE_LAYER)) {
    map.moveLayer(LAKES_OUTLINE_LAYER);
  }
  if (map.getLayer(RIVERS_LAYER)) {
    map.moveLayer(RIVERS_LAYER);
  }
  if (map.getLayer(BOUNDARY_LINE_LAYER)) {
    map.moveLayer(BOUNDARY_LINE_LAYER);
  }
  moveSettlementLabelsToTop(map);
}

export function SwissMap({ layers }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const layersRef = useRef(layers);
  const [ready, setReady] = useState(false);
  layersRef.current = layers;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    registerPmtilesProtocol();

    let cancelled = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE_URL,
      center: MAP_INITIAL_CENTER,
      zoom: MAP_INITIAL_ZOOM,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      attributionControl: {
        customAttribution: "© swisstopo",
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", async () => {
      if (cancelled) return;
      muteBasemap(map);
      addHillshadeLayer(map);

      await loadSwissLakes(map).catch((err) => console.warn("Lakes:", err));
      if (cancelled) return;
      await loadSwissRivers(map).catch((err) => console.warn("Rivers:", err));
      if (cancelled) return;

      await loadSwissBoundary(map).catch((err) => console.warn("Boundary:", err));
      if (cancelled) return;
      addBoundaryLineLayer(map);

      await loadSwissLabelLayers(map).catch((err) => console.warn("Settlement labels:", err));
      if (cancelled) return;

      orderReferenceLayers(map);
      applyLayerVisibility(map, layersRef.current);
      setReady(true);
    });

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyLayerVisibility(map, layers);
  }, [layers, ready]);

  return <div ref={containerRef} className="map-container" />;
}
