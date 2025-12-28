mapboxgl.accessToken = "pk.eyJ1IjoianZhbmxhcmUiLCJhIjoiY21oY2Zrd29nMTN2dDJtcHh5YzlxYWVtNSJ9.bP5BGQT-tdmmsC1SStqvNw";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11", // dark basemap
  center: [-119.0, 46.8],                  // temporary (we'll fit to bounds)
  zoom: 6
});

const AVA_URL = "./data/avas_wa.geojson";
const SOURCE_ID = "ava";
const FILL_ID = "ava-fill";
const OUTLINE_ID = "ava-outline"; 

let hoveredId = null;

map.on("load", async () => {
  const avaGeojson = await fetch(AVA_URL).then((r) => r.json());

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
    0.6,   // hovered AVA (stands out)
    0.12   // non-hovered AVAs (very transparent)
  ]
}
  });

  map.addLayer({
    id: OUTLINE_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-width": 2,
      "line-opacity": 0.65
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
    const createdRaw =
      f.properties?.created ??
      f.properties?.established ??
      f.properties?.date_created ??
      f.properties?.created_date ??
      null;

    let createdPretty = null;
    if (createdRaw) {
      const d = new Date(createdRaw);
      if (!isNaN(d.getTime())) {
        createdPretty = d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric"
        });
      }
    }

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
    }
    hoveredId = null;

    const info = document.getElementById("info");
    if (info) info.textContent = "Move your mouse over an AVA";
  });
});

