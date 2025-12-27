mapboxgl.accessToken = "pk.eyJ1IjoianZhbmxhcmUiLCJhIjoiY21oY2Zrd29nMTN2dDJtcHh5YzlxYWVtNSJ9.bP5BGQT-tdmmsC1SStqvNw";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11", // dark basemap
  center: [-119.0, 46.8],                  // temporary (we'll fit to bounds)
  zoom: 6
});

const AVA_URL = "./data/columbia_valley.geojson"; // rename your file to this
const SOURCE_ID = "ava";
const FILL_ID = "ava-fill";
const OUTLINE_ID = "ava-outline";

let hoveredId = null;

map.on("load", async () => {
  const res = await fetch(AVA_URL);
  const avaGeojson = await res.json();

  // Add data source
  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: avaGeojson,
    promoteId: "ava_id" // you have ava_id in properties, good for hover state
  });

  // Fill layer (base look)
  map.addLayer({
    id: FILL_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-opacity": 0.25,
      "fill-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "#2ecc71", // hover green
        "#ffffff"  // default subtle fill
      ]
    }
  });

  // Outline layer (crisp boundary)
  map.addLayer({
    id: OUTLINE_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-width": 2,
      "line-opacity": 0.85
    }
  });

  // Fit map to AVA
  const bbox = turf.bbox(avaGeojson); // [minX, minY, maxX, maxY]
  map.fitBounds(bbox, { padding: 60, duration: 800 });

  // Hover behavior
  map.on("mousemove", FILL_ID, (e) => {
    map.getCanvas().style.cursor = "pointer";

    if (!e.features.length) return;
    const f = e.features[0];

    // Clear previous hover state
    if (hoveredId !== null) {
      map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
    }

    hoveredId = f.id;
    map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: true });

    const info = document.getElementById("info");
    info.textContent = f.properties?.name ? `AVA: ${f.properties.name}` : "AVA boundary";
  });

  map.on("mouseleave", FILL_ID, () => {
    map.getCanvas().style.cursor = "";

    if (hoveredId !== null) {
      map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
    }
    hoveredId = null;

    document.getElementById("info").textContent = "Move your mouse over the AVA";
  });
});
