import { useState } from "react";
import { DEFAULT_LAYERS, type LayerId, type LayerVisibility } from "./config";
import { SwissMap } from "./map/SwissMap";

const LAYER_LABELS: Record<LayerId, string> = {
  hillshade: "Relief",
  lakes: "Lakes",
  rivers: "Rivers",
  boundary: "Swiss boundary",
  settlements: "Place names",
};

export function App() {
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);

  const toggle = (id: LayerId) => setLayers((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="app-shell">
      <SwissMap layers={layers} />
      <aside className="layer-panel" aria-label="Map layers">
        <h1 className="layer-panel__title">Switzerland</h1>
        {(Object.keys(LAYER_LABELS) as LayerId[]).map((id) => (
          <label key={id} className="layer-toggle">
            <input type="checkbox" checked={layers[id]} onChange={() => toggle(id)} />
            <span>{LAYER_LABELS[id]}</span>
          </label>
        ))}
      </aside>
    </div>
  );
}
