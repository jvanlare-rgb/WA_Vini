// js/main.js
import { CONFIG } from "./config.js";
import { initMap } from "./map/initMap.js";
import { addAvaSourceAndLayers, addTerrainAndHillshade } from "./map/layers.js";
import { attachHover } from "./interactions/hover.js";
import { attachClick } from "./interactions/click.js";

const map = initMap(mapboxgl, CONFIG);

const state = {
  hoveredId: null,
  areaById: new Map(),
  avaGeojson: null
};

map.on("load", async () => {
  // Load AVA geojson
  const avaGeojson = await fetch(CONFIG.data.AVA_URL).then((r) => r.json());
  state.avaGeojson = avaGeojson;

  // Cache areas by promoted id (ava_id)
  for (const feat of avaGeojson.features) {
    const id = feat?.properties?.ava_id ?? feat?.id;
    if (id != null) state.areaById.set(String(id), turf.area(feat));
  }

  // Sources + layers
  addAvaSourceAndLayers(map, avaGeojson, CONFIG.ids);
  addTerrainAndHillshade(map, CONFIG.ids);

  // --- Vineyards layer (empty until an AVA is clicked) ---
  map.addSource("vineyards", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] }
  });
  
  map.addLayer({
    id: "vineyards-fill",
    type: "fill",
    source: "vineyards",
    paint: {
      "fill-color": "#7CFC90",
      "fill-opacity": 0.22
    }
  });
  
  map.addLayer({
    id: "vineyards-outline",
    type: "line",
    source: "vineyards",
    paint: {
      "line-color": "#7CFC90",
      "line-width": 1.2,
      "line-opacity": 0.65
    }
  });


  // Fit to all AVAs
  const bbox = turf.bbox(avaGeojson);
  map.fitBounds(bbox, { padding: 60, duration: 800 });

  // Interactions
  attachHover(map, state, CONFIG.ids);
  attachClick(map, turf, CONFIG.ids, state.areaById);
});
