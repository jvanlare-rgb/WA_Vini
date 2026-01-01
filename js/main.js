mapboxgl.accessToken = "pk.eyJ1IjoianZhbmxhcmUiLCJhIjoiY21oY2Zrd29nMTN2dDJtcHh5YzlxYWVtNSJ9.bP5BGQT-tdmmsC1SStqvNw";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/jvanlare/cmjuj1tdb000z01s48ibtg7t1",
  center: [-119.0, 46.8],
  zoom: 6
});

const AVA_URL = "./data/avas_wa.geojson";

const SOURCE_ID = "ava";
const FILL_ID = "ava-fill";
const OUTLINE_ID = "ava-outline";

let hoveredId = null;
const areaById = new Map();

function getCreatedRaw(props) {
  return (
    props?.created ??
    props?.established ??
    props?.established_date ??
    props?.date ??
    props?.created_date ??
    null
  );
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Map area -> maxZoom. Tune the numbers to taste.
function zoomFromAreaSqMeters(area) {
  // log scale so it feels natural
  const logA = Math.log10(area);

  // Example mapping:
  // log10(area) ~ 7.5 (small) => zoom ~ 12.8
  // log10(area) ~ 10.5 (huge) => zoom ~ 9.5
  const z = 22.0 - 1.2 * logA;

  return clamp(z, 8.5, 13.5);
}


// Fetches all Geojson
map.on("load", async () => {
  const avaGeojson = await fetch(AVA_URL).then(r => r.json());

  // Cache areas by promoted id (ava_id)
  for (const feat of avaGeojson.features) {
    const id = feat?.properties?.ava_id ?? feat?.id;
    if (id != null) areaById.set(String(id), turf.area(feat));
  }

  // AVA source + layers
  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: avaGeojson,
    promoteId: "ava_id"
  });

  // AVA overlay
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

  // 1) DEM for terrain
  map.addSource("dem-terrain", {
    type: "raster-dem",
    url: "mapbox://mapbox.mapbox-terrain-dem-v1",
    tileSize: 512,
    maxzoom: 14
  });

  map.setTerrain({ source: "dem-terrain", exaggeration: 1.3 });

  // 2) DEM for hillshade (separate source => full res)
  map.addSource("dem-hillshade", {
    type: "raster-dem",
    url: "mapbox://mapbox.mapbox-terrain-dem-v1",
    tileSize: 512,
    maxzoom: 14
  });

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
);


// keep AVAs above hillshade
map.moveLayer(FILL_ID);
map.moveLayer(OUTLINE_ID);

// Fit to all AVAs
const bbox = turf.bbox(avaGeojson);
map.fitBounds(bbox, { padding: 60, duration: 800 });

map.on("mousemove", (e) => {
  const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });

  if (!hits.length) {
    map.getCanvas().style.cursor = "";
    if (hoveredId !== null) {
      map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
      hoveredId = null;
    }
    document.getElementById("info").textContent = "Move your mouse over an AVA";
    return;
  }

  map.getCanvas().style.cursor = "pointer";

  // pick smallest
  let chosen = hits[0];
  let bestArea = Infinity;

  for (const f of hits) {
    const id = String(f.id);
    const a = areaById.get(id) ?? turf.area(f);
    if (a < bestArea) {
      bestArea = a;
      chosen = f;
    }
  }

  if (hoveredId !== null && hoveredId !== chosen.id) {
    map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
  }

  hoveredId = chosen.id;
  map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: true });

  const info = document.getElementById("info");
  const name = chosen.properties?.name ?? chosen.properties?.title ?? "AVA";
  const createdRaw = getCreatedRaw(chosen.properties);

  const createdPretty = createdRaw
    ? new Date(createdRaw).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;

  info.innerHTML = `
    <div>AVA: ${name}</div>
    <div style="opacity:0.85; font-size:0.9em;">
      Date created: ${createdPretty ?? createdRaw ?? "Unknown"}
    </div>
  `;
});


map.on("mouseleave", FILL_ID, () => {
  map.getCanvas().style.cursor = "";
  if (hoveredId !== null) {
    map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
    hoveredId = null;
  }
  document.getElementById("info").textContent = "Move your mouse over an AVA";
});

  
map.on("click", (e) => {
  const features = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });

  if (!features.length) {
    map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    return;
  }

    // pick smallest overlapped AVA
    let chosen = features[0];
    let bestArea = Infinity;
  
    for (const f of features) {
      const id = String(f.id);
      const a = areaById.get(id) ?? turf.area(f);
      if (a < bestArea) {
        bestArea = a;
        chosen = f;
      }
    }
  
    const id = String(chosen.id);
    const area = areaById.get(id) ?? turf.area(chosen);
  
    const bounds = turf.bbox(chosen);
  
    // Compute proportional zoom
    const maxZoom = zoomFromAreaSqMeters(area);
  
    // Optional: make padding slightly larger for tiny AVAs
    const padding = clamp(120 - Math.log10(area) * 8, 60, 120);
  
    map.fitBounds(bounds, {
      padding,
      duration: 1200,
      maxZoom
    });
  
    map.easeTo({ pitch: 70, bearing: -25, duration: 1200 });
});

});
