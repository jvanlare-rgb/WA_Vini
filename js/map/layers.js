// js/map/layers.js
export function addAvaSourceAndLayers(map, avaGeojson, ids) {
  const { SOURCE_ID, FILL_ID, OUTLINE_ID } = ids;

  // AVA source
  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: avaGeojson,
    promoteId: "ava_id"
  });

  // AVA fill
  map.addLayer({
    id: FILL_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "#2ecc71",
        "#D3D3D3"
      ],
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        0.30,
        0.12
      ]
    }
  });

  // AVA outline
  map.addLayer({
    id: OUTLINE_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-width": 1,
      "line-opacity": 0.55
    }
  });
}

export function addTerrainAndHillshade(map, ids) {
  const { FILL_ID, OUTLINE_ID } = ids;

  // 1) DEM for terrain
  map.addSource("dem-terrain", {
    type: "raster-dem",
    url: "mapbox://mapbox.mapbox-terrain-dem-v1",
    tileSize: 512,
    maxzoom: 14
  });

  map.setTerrain({ source: "dem-terrain", exaggeration: 1.3 });

  // 2) DEM for hillshade (separate source => full res hillshade)
  map.addSource("dem-hillshade", {
    type: "raster-dem",
    url: "mapbox://mapbox.mapbox-terrain-dem-v1",
    tileSize: 512,
    maxzoom: 14
  });

  // Try to insert hillshade below labels (so labels stay readable)
  const style = map.getStyle();
  const labelLayerId =
    style?.layers?.find(
      (l) => l.type === "symbol" && l.layout && l.layout["text-field"]
    )?.id ?? null;

  map.addLayer(
    {
      id: "hillshade",
      type: "hillshade",
      source: "dem-hillshade",
      paint: {
        "hillshade-exaggeration": 0.2,
        "hillshade-shadow-color": "rgba(0,0,0,0.08)",
        "hillshade-highlight-color": "rgba(255,255,255,0.08)",
        "hillshade-accent-color": "rgba(0,0,0,0.04)"
      }
    },
    labelLayerId // if null, Mapbox just adds it on top
  );

  // Keep AVAs above hillshade
  map.moveLayer(FILL_ID);
  map.moveLayer(OUTLINE_ID);
}

