mapboxgl.accessToken = "pk.eyJ1IjoianZhbmxhcmUiLCJhIjoiY21oY2Zrd29nMTN2dDJtcHh5YzlxYWVtNSJ9.bP5BGQT-tdmmsC1SStqvNw";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-119.0, 46.8],
  zoom: 6
});

const AVA_URL = "./data/avas_wa.geojson";

const SOURCE_ID = "ava";
const FILL_ID = "ava-fill";
const OUTLINE_ID = "ava-outline";

let hoveredId = null;

// cache area by feature id so we can quickly choose the smallest AVA under the mouse
const areaById = new Map();

// helper: try a few likely property names for "created"
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

map.on("load", async () => {
  const avaGeojson = await fetch(AVA_URL).then(r => r.json());

  map.addSource("mapbox-dem", {
  type: "raster-dem",
  url: "mapbox://mapbox.mapbox-terrain-dem-v1",
  tileSize: 512,
  maxzoom: 14
});

map.setTerrain({ source: "mapbox-dem", exaggeration: 1.6 }); // bump up/down: 1.2–2.2

map.addLayer({
  id: "hillshade",
  type: "hillshade",
  source: "mapbox-dem",
  paint: {
    "hillshade-exaggeration": 0.6
  }
});

  // build area cache (uses Turf). If a feature is missing an id, promoteId below must match.
  for (const feat of avaGeojson.features) {
    // With promoteId:"ava_id", Mapbox feature.id becomes feat.properties.ava_id at render time
    // Here we can cache by that same value.
    const id = feat?.properties?.ava_id ?? feat?.id;
    if (id != null) areaById.set(id, turf.area(feat));
  }

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: avaGeojson,
    promoteId: "ava_id"
  });

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
        0.6,   // hovered AVA
        0.12   // all other AVAs (transparent so you can see basemap)
      ]
    }
  });

  map.addLayer({
    id: OUTLINE_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-width": 2,
      "line-opacity": 0.85
    }
  });

  // Fit to all AVAs
  const bbox = turf.bbox(avaGeojson);
  map.fitBounds(bbox, { padding: 60, duration: 800 });

  // Hover behavior (pick smallest polygon under cursor)
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

    // Choose smallest by area (so little AVAs win even when overlapped)
    let chosen = hits[0];
    let bestArea = Infinity;

    for (const f of hits) {
      const id = f.id;
      const a = areaById.get(id);

      // fallback: if not cached for some reason, compute on the fly
      const area = (a != null) ? a : turf.area(f);

      if (area < bestArea) {
        bestArea = area;
        chosen = f;
      }
    }

    const areaSqmById = new Map();

    for (const feat of avaGeojson.features) {
      const id = feat.properties.ava_id;
      areaSqmById.set(id, turf.area(feat));
  }

    // update hover state
    if (hoveredId !== null && hoveredId !== chosen.id) {
      map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
    }

    hoveredId = chosen.id;
    map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: true });

    // update sidebar
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

  map.on("click", FILL_ID, (e) => {
  const features = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });
  if (!features.length) return;

  // choose smallest area feature at the click point (helps with overlaps)
  let chosen = features[0];
  let bestArea = Infinity;

  for (const f of features) {
    const id = f.properties?.ava_id ?? f.id;
    const area = areaSqmById.get(id);

    // if missing, treat as large so it won't win
    const a = (typeof area === "number") ? area : Infinity;

    if (a < bestArea) {
      bestArea = a;
      chosen = f;
    }
  }

  const bounds = turf.bbox(chosen); // [minX, minY, maxX, maxY]

  // Zoom to bounds, and tilt into a 3D view
  map.fitBounds(bounds, {
    padding: 80,
    duration: 1200,
    maxZoom: 12.5 // raise if you want tighter zoom on tiny AVAs
  });

  // Immediately (or after) apply pitch/bearing for 3D effect
  map.easeTo({
    pitch: 70,      // 0 = top-down, 60–75 = strong 3D
    bearing: -25,   // rotate a bit so terrain looks more dramatic
    duration: 1200
  });
});


  map.on("click", (e) => {
  const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });
  if (hits.length) return;

  map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
});


  map.on("mouseleave", FILL_ID, () => {
    map.getCanvas().style.cursor = "";
    if (hoveredId !== null) {
      map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
    }
    hoveredId = null;
    document.getElementById("info").textContent = "Move your mouse over an AVA";
  });
});
