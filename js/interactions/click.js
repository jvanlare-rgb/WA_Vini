// js/interactions/click.js

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function zoomFromArea(areaSqM) {
  const logA = Math.log10(Math.max(areaSqM, 1));
  const z = 22.0 - 1.5 * logA;
  return clamp(z, 8.5, 14.2);
}

function pitchFromArea(areaSqM) {
  const logA = Math.log10(Math.max(areaSqM, 1));
  return clamp(92 - logA * 6, 45, 75);
}

function paddingFromArea(areaSqM) {
  const logA = Math.log10(Math.max(areaSqM, 1));
  return clamp(140 - logA * 8, 60, 140);
}

function pickSmallestFeature(features, areaById, turf) {
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
  return chosen;
}

function getFeatureCenter(feature, turf) {
  try {
    return turf.centerOfMass(feature).geometry.coordinates;
  } catch {
    return turf.center(feature).geometry.coordinates;
  }
}

/**
 * @param {mapboxgl.Map} map
 * @param {object} turf
 * @param {object} ids e.g. { FILL_ID: "ava-fill" }
 * @param {Map<string, number>} areaById
 */
export function attachClick(map, turf, ids, areaById) {
  const { FILL_ID } = ids;

  map.on("click", (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_ID] });

    if (!hits.length) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
      return;
    }

    const chosen = pickSmallestFeature(hits, areaById, turf);

    const id = String(chosen.id);
    const area = areaById.get(id) ?? turf.area(chosen);
    const center = getFeatureCenter(chosen, turf);

    const zoom = zoomFromArea(area);
    const pitch = pitchFromArea(area);
    const pad = paddingFromArea(area);

    map.easeTo({
      center,
      zoom,
      pitch,
      bearing: -25,
      duration: 1200,
      padding: { top: pad, bottom: pad, left: pad, right: pad }
    });
  });
}
