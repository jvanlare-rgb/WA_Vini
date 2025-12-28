mapboxgl.accessToken = "pk.eyJ1IjoianZhbmxhcmUiLCJhIjoiY21oY2Zrd29nMTN2dDJtcHh5YzlxYWVtNSJ9.bP5BGQT-tdmmsC1SStqvNw";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11", // dark basemap
  center: [-119.0, 46.8],                  // temporary (we'll fit to bounds)
  zoom: 6
});

const C_VAL_URL = "./data/columbia_valley.geojson";
const C_GOR_URL = "./data/columbia_gorge.geojson";
const RAT_HILL_URL = "./data/rattlesnake_hills.geojson";
const SOURCE_ID = "ava";
const FILL_ID = "ava-fill";
const OUTLINE_ID = "ava-outline"; 
let hoveredId = null;

map.on("load", async () => {
  const [val, gor, rat] = await Promise.all([
    fetch(C_VAL_URL).then(r => r.json()),
    fetch(C_GOR_URL).then(r => r.json()),
    fetch(RAT_HILL_URL).then(r => r.json())
  ]);

  // Combine all features into one FeatureCollection
  const avaGeojson = {
    type: "FeatureCollection",
    features: [
      ...val.features,
      ...gor.features,
      ...rat.features
    ]
  };

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: avaGeojson,
    // Only works if each feature has a unique ava_id
    promoteId: "ava_id"
  });

  map.addLayer({
    id: FILL_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-opacity": 0.25,
      "fill-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "#2ecc71",
        "#ffffff"
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

  // Hover behavior
  map.on("mousemove", FILL_ID, (e) => {
    map.getCanvas().style.cursor = "pointer";
    if (!e.features.length) return;

    const f = e.features[0];

    if (hoveredId !== null) {
      map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
    }

    hoveredId = f.id;
    map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: true });

    const info = document.getElementById("info");
    const name = f.properties?.name;
    const createdRaw = f.properties?.created;

// nice formatting (optional)
    const createdPretty = createdRaw
    ? new Date(createdRaw).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
  : null;

  if (name) {
    info.innerHTML = `
      <div>AVA: ${name}</div>
      <div style="opacity:0.85; font-size:0.9em;">Date created: ${createdPretty ?? createdRaw ?? "Unknown"}</div>
      `;
  } else {
    info.textContent = "AVA boundary";
}

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

