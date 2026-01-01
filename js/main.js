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

  map.addLayer({
    id: OUTLINE_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-width": 1,
      "line-opacity": 0.55
    }
  });

  // Terrain + hillshade
  map.addSource("mapbox-dem", {
    type: "raster-dem",
    url: "mapbox://mapbox.mapbox-terrain-dem-v1",
    tileSize: 512,
    maxzoom: 14
  });

  map.setTerrain({ source: "mapbox-dem", exaggeration: 1.6 });

  map.addLayer({
    id: "hillshade",
    type: "hillshade",
    source: "mapbox-dem",
    paint: { "hillshade-exaggeration": 0.6,
           "hillshade-opacity": 0.25
           }
  });

  // Put hillshade under AVA fill (so it doesn't wash out your polygons)
  map.moveLayer("hillshade", FILL_ID);

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

  // Click: choose smallest overlapped AVA, zoom + tilt; click empty resets
  map.on("click", (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });

    if (!features.length) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      return;
    }

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

    const bounds = turf.bbox(chosen);

    map.fitBounds(bounds, { padding: 80, duration: 1200, maxZoom: 12.5 });
    map.easeTo({ pitch: 70, bearing: -25, duration: 1200 });
  });
});
